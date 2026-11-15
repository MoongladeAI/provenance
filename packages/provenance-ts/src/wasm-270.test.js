// WASM 2.7.0 bindings tests: OpenPGP V4 EdDSALegacy (algorithm 22) packet parser and
// strict DER RFC 3161 TimeStampResp messageImprint comparator.
const assert = require('node:assert/strict');
const wasm = require('../wasm/mgc_wasm.js');

function computePgpCrc24(bytes) {
  let crc = 0x00b704ce;
  for (const b of bytes) {
    crc ^= (b << 16);
    for (let i = 0; i < 8; i++) {
      crc <<= 1;
      if (crc & 0x01000000) crc ^= 0x01864cfb;
    }
  }
  return crc & 0x00ffffff;
}

function encodeCrc24B64(bytes) {
  const crc = computePgpCrc24(bytes);
  return Buffer.from([(crc >> 16) & 0xff, (crc >> 8) & 0xff, crc & 0xff]).toString('base64');
}

function mpiBitLength(scalarBytes) {
  let firstNonZero = 0;
  while (firstNonZero < scalarBytes.length && scalarBytes[firstNonZero] === 0) {
    firstNonZero++;
  }
  if (firstNonZero === scalarBytes.length) {
    throw new Error('Zero-value MPI is invalid in RFC 4880');
  }
  const topBits = 32 - Math.clz32(scalarBytes[firstNonZero]);
  const remBytes = scalarBytes.length - firstNonZero - 1;
  return {
    trimmed: scalarBytes.subarray(firstNonZero),
    bitLen: topBits + remBytes * 8
  };
}

function makeOpenPgpV4SigPacket({
  version = 4,
  pubkeyAlgo = 22,
  newFormat = false,
  hashedSubpackets = Buffer.alloc(0),
  rBytes,
  sBytes
}) {
  const body = [
    version,
    0x00, // binary document signature
    pubkeyAlgo,
    8, // SHA-256
    (hashedSubpackets.length >> 8) & 0xff,
    hashedSubpackets.length & 0xff,
    ...hashedSubpackets,
    0, 0, // unhashed subpacket length = 0
    0xab, 0xcd // left 16 bits of hash
  ];

  for (const raw of [rBytes, sBytes]) {
    const { trimmed, bitLen } = mpiBitLength(raw);
    body.push((bitLen >> 8) & 0xff, bitLen & 0xff, ...trimmed);
  }

  if (newFormat) {
    if (body.length >= 192) {
      throw new Error(`New-format test fixture expects body.length < 192, got ${body.length}`);
    }
    return Buffer.from([0xc2, body.length, ...body]);
  }
  if (body.length > 255) {
    throw new Error(`Old-format 1-octet test fixture expects body.length <= 255, got ${body.length}`);
  }
  return Buffer.from([0x88, body.length, ...body]);
}

function wrapPgpArmor(packet, crcOverride = null) {
  const crc = crcOverride ?? encodeCrc24B64(packet);
  return [
    '-----BEGIN PGP SIGNATURE-----',
    '',
    packet.toString('base64'),
    `=${crc}`,
    '-----END PGP SIGNATURE-----',
    ''
  ].join('\n');
}

function derLen(len) {
  if (len < 0x80) return [len];
  if (len <= 0xff) return [0x81, len];
  return [0x82, (len >> 8) & 0xff, len & 0xff];
}

function derWrap(tag, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([Buffer.from([tag]), Buffer.from(derLen(bytes.length)), bytes]);
}

function buildTestTsr({
  digest = Buffer.alloc(32, 0x42),
  pkiStatus = 0x00,
  eContentTag = 0x04,
  hashedMessageTag = 0x04,
  genTime = '20261114120000Z'
} = {}) {
  const policyOid = derWrap(0x06, [0x2a, 0x03, 0x04]);
  const sha256Oid = derWrap(0x06, [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
  const tstOid = derWrap(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04]);
  const signedDataOid = derWrap(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]);

  const tstInfo = derWrap(0x30, Buffer.concat([
    derWrap(0x02, [0x01]),
    policyOid,
    derWrap(0x30, Buffer.concat([
      derWrap(0x30, sha256Oid),
      derWrap(hashedMessageTag, digest)
    ])),
    derWrap(0x02, [0x01, 0x02]),
    derWrap(0x18, Buffer.from(genTime, 'ascii'))
  ]));

  const encapContentInfo = derWrap(0x30, Buffer.concat([
    tstOid,
    derWrap(0xa0, derWrap(eContentTag, tstInfo))
  ]));

  const signedData = derWrap(0x30, Buffer.concat([
    derWrap(0x02, [0x03]),
    derWrap(0x31, []),
    encapContentInfo,
    derWrap(0x31, [])
  ]));

  const contentInfo = derWrap(0x30, Buffer.concat([
    signedDataOid,
    derWrap(0xa0, signedData)
  ]));

  const statusInfo = derWrap(0x30, derWrap(0x02, [pkiStatus]));
  return new Uint8Array(derWrap(0x30, Buffer.concat([statusInfo, contentInfo])));
}

function assertThrowsMatch(fn, pattern) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught !== null, `Expected error matching ${pattern}, but call succeeded`);
  const message = caught && typeof caught === 'object' && 'message' in caught
    ? String(caught.message)
    : String(caught);
  assert.match(message, pattern);
}

describe('2.7.0 WASM bindings', () => {
  it('exports parse_openpgp_armored_signature_hex and verify_rfc3161_timestamp', () => {
    assert.equal(typeof wasm.parse_openpgp_armored_signature_hex, 'function');
    assert.equal(typeof wasm.verify_rfc3161_timestamp, 'function');
  });

  describe('parse_openpgp_armored_signature_hex', () => {
    it('left-pads short MPI scalars (leading-zero Ed25519 R/S) with canonical bit lengths to 128 hex chars', () => {
      const rRaw = Buffer.alloc(31, 0x11);
      const sRaw = Buffer.alloc(32, 0x99);
      const packet = makeOpenPgpV4SigPacket({ rBytes: rRaw, sBytes: sRaw });
      const armor = wrapPgpArmor(packet);

      const hexSig = wasm.parse_openpgp_armored_signature_hex(armor);
      assert.equal(hexSig.length, 128);
      assert.equal(hexSig, '00' + rRaw.toString('hex') + sRaw.toString('hex'));
    });

    it('parses new-format CTB (0xc2) packets with non-empty hashed subpackets', () => {
      const rRaw = Buffer.alloc(32, 0x81);
      const sRaw = Buffer.alloc(31, 0x05);
      const packet = makeOpenPgpV4SigPacket({
        newFormat: true,
        hashedSubpackets: Buffer.from([0x05, 0x02, 0x69, 0x16, 0x00, 0x00]),
        rBytes: rRaw,
        sBytes: sRaw
      });
      const hexSig = wasm.parse_openpgp_armored_signature_hex(wrapPgpArmor(packet));
      assert.equal(hexSig, rRaw.toString('hex') + '00' + sRaw.toString('hex'));
    });

    it('rejects a corrupted Radix-64 CRC-24 checksum', () => {
      const packet = makeOpenPgpV4SigPacket({
        rBytes: Buffer.alloc(32, 0x22),
        sBytes: Buffer.alloc(32, 0x33)
      });
      const armor = wrapPgpArmor(packet, 'AAAA');
      assertThrowsMatch(
        () => wasm.parse_openpgp_armored_signature_hex(armor),
        /Radix-64 CRC-24 mismatch/
      );
    });

    it('rejects non-EdDSALegacy public-key algorithms (e.g. RSA = 1)', () => {
      const packet = makeOpenPgpV4SigPacket({
        pubkeyAlgo: 1,
        rBytes: Buffer.alloc(32, 0x22),
        sBytes: Buffer.alloc(32, 0x33)
      });
      const armor = wrapPgpArmor(packet);
      assertThrowsMatch(
        () => wasm.parse_openpgp_armored_signature_hex(armor),
        /Unsupported public-key algorithm/
      );
    });

    it('rejects malformed ASCII armor without header boundaries', () => {
      assertThrowsMatch(
        () => wasm.parse_openpgp_armored_signature_hex('not a pgp signature'),
        /Invalid OpenPGP ASCII armor envelope/
      );
    });
  });

  describe('verify_rfc3161_timestamp', () => {
    it('verifies matching SHA-256 imprint in DER TimeStampResp and returns ISO-8601 gen_time', () => {
      const digest = new Uint8Array(32).fill(0x42);
      const tsr = buildTestTsr({ digest: Buffer.from(digest), genTime: '20261114120000Z' });

      const verdict = JSON.parse(wasm.verify_rfc3161_timestamp(tsr, digest));
      assert.equal(verdict.status, 'granted');
      assert.equal(verdict.digest_matches, true);
      assert.equal(verdict.tst_info.gen_time, '2026-11-14T12:00:00Z');
      assert.equal(verdict.tst_info.hash_algorithm_name, 'SHA-256');
    });

    it('rejects mismatched 32-byte digest with ERR_TSR_DIGEST_MISMATCH', () => {
      const tsr = buildTestTsr({ digest: Buffer.alloc(32, 0x42) });
      const wrongDigest = new Uint8Array(32).fill(0x99);
      assertThrowsMatch(
        () => wasm.verify_rfc3161_timestamp(tsr, wrongDigest),
        /ERR_TSR_DIGEST_MISMATCH/
      );
    });

    it('rejects unsupported digest lengths with ERR_TSR_INVALID_DIGEST_LEN', () => {
      const tsr = buildTestTsr({ digest: Buffer.alloc(32, 0x42) });
      const badLenDigest = new Uint8Array(16).fill(0x42);
      assertThrowsMatch(
        () => wasm.verify_rfc3161_timestamp(tsr, badLenDigest),
        /ERR_TSR_INVALID_DIGEST_LEN/
      );
    });

    it('rejects non-granted PKIStatus (rejection = 2) with ERR_TSR_STATUS_REJECTED', () => {
      const digest = new Uint8Array(32).fill(0x42);
      const tsr = buildTestTsr({ digest: Buffer.from(digest), pkiStatus: 0x02 });
      assertThrowsMatch(
        () => wasm.verify_rfc3161_timestamp(tsr, digest),
        /ERR_TSR_STATUS_REJECTED/
      );
    });

    it('rejects constructed 0x24 OCTET STRING BER trap in messageImprint with ERR_TSR_DER_UNEXPECTED_TAG', () => {
      const digest = new Uint8Array(32).fill(0x42);
      const tsr = buildTestTsr({ digest: Buffer.from(digest), hashedMessageTag: 0x24 });
      assertThrowsMatch(
        () => wasm.verify_rfc3161_timestamp(tsr, digest),
        /ERR_TSR_DER_UNEXPECTED_TAG/
      );
    });

    it('rejects constructed 0x24 OCTET STRING BER trap in SignedData eContent with ERR_TSR_DER_UNEXPECTED_TAG', () => {
      const digest = new Uint8Array(32).fill(0x42);
      const tsr = buildTestTsr({ digest: Buffer.from(digest), eContentTag: 0x24 });
      assertThrowsMatch(
        () => wasm.verify_rfc3161_timestamp(tsr, digest),
        /ERR_TSR_DER_UNEXPECTED_TAG/
      );
    });
  });
});
