(function (root) {
  'use strict';
  // Destination address validation (UX only; server-side isValidAddress is
  // authoritative). null = no offline validator for the coin.
  const AddressValidation = (function() {
    const RC = [
      0x00000001, 0x00000000, 0x00008082, 0x00000000, 0x0000808a, 0x80000000,
      0x80008000, 0x80000000, 0x0000808b, 0x00000000, 0x80000001, 0x00000000,
      0x80008081, 0x80000000, 0x00008009, 0x80000000, 0x0000008a, 0x00000000,
      0x00000088, 0x00000000, 0x80008009, 0x00000000, 0x8000000a, 0x00000000,
      0x8000808b, 0x00000000, 0x0000008b, 0x80000000, 0x00008089, 0x80000000,
      0x00008003, 0x80000000, 0x00008002, 0x80000000, 0x00000080, 0x80000000,
      0x0000800a, 0x00000000, 0x8000000a, 0x80000000, 0x80008081, 0x80000000,
      0x00008080, 0x80000000, 0x80000001, 0x00000000, 0x80008008, 0x80000000,
    ];
    const RHO = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
    const PI = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

    function keccakF(s) {
      const bc = new Int32Array(10);
      for (let round = 0; round < 24; round++) {
        for (let i = 0; i < 5; i++) {
          bc[i * 2] = s[i * 2] ^ s[i * 2 + 10] ^ s[i * 2 + 20] ^ s[i * 2 + 30] ^ s[i * 2 + 40];
          bc[i * 2 + 1] = s[i * 2 + 1] ^ s[i * 2 + 11] ^ s[i * 2 + 21] ^ s[i * 2 + 31] ^ s[i * 2 + 41];
        }
        for (let i = 0; i < 5; i++) {
          const i1 = ((i + 1) % 5) * 2;
          const i4 = ((i + 4) % 5) * 2;
          const t_lo = bc[i4] ^ ((bc[i1] << 1) | (bc[i1 + 1] >>> 31));
          const t_hi = bc[i4 + 1] ^ ((bc[i1 + 1] << 1) | (bc[i1] >>> 31));
          for (let j = 0; j < 25; j += 5) {
            s[(j + i) * 2] ^= t_lo;
            s[(j + i) * 2 + 1] ^= t_hi;
          }
        }
        let t_lo = s[2], t_hi = s[3];
        for (let i = 0; i < 24; i++) {
          const j = PI[i];
          const b_lo = s[j * 2], b_hi = s[j * 2 + 1];
          const r = RHO[i];
          if (r < 32) {
            s[j * 2] = (t_lo << r) | (t_hi >>> (32 - r));
            s[j * 2 + 1] = (t_hi << r) | (t_lo >>> (32 - r));
          } else {
            const rr = r - 32;
            s[j * 2] = (t_hi << rr) | (t_lo >>> (32 - rr));
            s[j * 2 + 1] = (t_lo << rr) | (t_hi >>> (32 - rr));
          }
          t_lo = b_lo; t_hi = b_hi;
        }
        for (let j = 0; j < 25; j += 5) {
          for (let i = 0; i < 5; i++) {
            bc[i * 2] = s[(j + i) * 2];
            bc[i * 2 + 1] = s[(j + i) * 2 + 1];
          }
          for (let i = 0; i < 5; i++) {
            s[(j + i) * 2] ^= ~bc[((i + 1) % 5) * 2] & bc[((i + 2) % 5) * 2];
            s[(j + i) * 2 + 1] ^= ~bc[((i + 1) % 5) * 2 + 1] & bc[((i + 2) % 5) * 2 + 1];
          }
        }
        s[0] ^= RC[round * 2];
        s[1] ^= RC[round * 2 + 1];
      }
    }

    function keccak256(bytes) {
      const s = new Int32Array(50);
      const blockBytes = 136;
      const padded = new Uint8Array(Math.ceil((bytes.length + 1) / blockBytes) * blockBytes);
      padded.set(bytes);
      padded[bytes.length] ^= 0x01;
      padded[padded.length - 1] ^= 0x80;
      for (let off = 0; off < padded.length; off += blockBytes) {
        for (let i = 0; i < blockBytes / 4; i++) {
          s[i] ^= padded[off + i * 4] | (padded[off + i * 4 + 1] << 8) | (padded[off + i * 4 + 2] << 16) | (padded[off + i * 4 + 3] << 24);
        }
        keccakF(s);
      }
      const out = new Uint8Array(32);
      for (let i = 0; i < 4; i++) {
        const lo = s[i * 2], hi = s[i * 2 + 1];
        out[i * 8] = lo & 0xff; out[i * 8 + 1] = (lo >>> 8) & 0xff; out[i * 8 + 2] = (lo >>> 16) & 0xff; out[i * 8 + 3] = (lo >>> 24) & 0xff;
        out[i * 8 + 4] = hi & 0xff; out[i * 8 + 5] = (hi >>> 8) & 0xff; out[i * 8 + 6] = (hi >>> 16) & 0xff; out[i * 8 + 7] = (hi >>> 24) & 0xff;
      }
      return out;
    }

    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const FULL_BLOCK_SIZE = 8, FULL_ENCODED_BLOCK_SIZE = 11;
    const ENC_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];

    function decodeBlock(str, buf, index) {
      const size = ENC_LEN.indexOf(str.length);
      if (size <= 0) return false;
      let resNum = 0n, order = 1n;
      for (let i = str.length - 1; i >= 0; i--) {
        const digit = B58.indexOf(str[i]);
        if (digit < 0) return false;
        resNum += order * BigInt(digit);
        order *= 58n;
      }
      if (size < FULL_BLOCK_SIZE && resNum >= 1n << BigInt(8 * size)) return false;
      for (let i = size - 1; i >= 0; i--) { buf[index + i] = Number(resNum & 0xffn); resNum >>= 8n; }
      return true;
    }

    function moneroBase58Decode(address) {
      if (address.length === 0) return null;
      const fullBlocks = Math.floor(address.length / FULL_ENCODED_BLOCK_SIZE);
      const lastSize = address.length % FULL_ENCODED_BLOCK_SIZE;
      const lastDecoded = ENC_LEN.indexOf(lastSize);
      if (lastSize !== 0 && lastDecoded <= 0) return null;
      const dataLen = fullBlocks * FULL_BLOCK_SIZE + (lastSize ? lastDecoded : 0);
      const buf = new Uint8Array(dataLen);
      for (let i = 0; i < fullBlocks; i++) {
        if (!decodeBlock(address.substr(i * FULL_ENCODED_BLOCK_SIZE, FULL_ENCODED_BLOCK_SIZE), buf, i * FULL_BLOCK_SIZE)) return null;
      }
      if (lastSize) {
        if (!decodeBlock(address.substr(fullBlocks * FULL_ENCODED_BLOCK_SIZE, lastSize), buf, fullBlocks * FULL_BLOCK_SIZE)) return null;
      }
      return buf;
    }

    function decodeVarint(buf) {
      let result = 0n, shift = 0n;
      for (let i = 0; i < buf.length; i++) {
        result |= BigInt(buf[i] & 0x7f) << shift;
        if ((buf[i] & 0x80) === 0) return [Number(result), i + 1];
        shift += 7n;
        if (shift > 63n) return null;
      }
      return null;
    }

    function isValidMoneroAddress(address, prefixes) {
      const data = moneroBase58Decode(address);
      if (!data || data.length < 5) return false;
      const payload = data.slice(0, data.length - 4);
      const checksum = data.slice(data.length - 4);
      const hash = keccak256(payload);
      for (let i = 0; i < 4; i++) { if (hash[i] !== checksum[i]) return false; }
      const decoded = decodeVarint(payload);
      if (!decoded) return false;
      const [prefix, prefixLen] = decoded;
      if (payload.length !== prefixLen + 64) return false;
      if (!prefixes || prefixes.length === 0) return true;
      return prefixes.indexOf(prefix) !== -1;
    }

    // --- SHA-256 (for Base58Check sha256d checksum) ---
    const K256 = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    function sha256(msg) {
      const rotr = (x, n) => (x >>> n) | (x << (32 - n));
      const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
      const l = msg.length;
      const withOne = new Uint8Array((((l + 8) >> 6) + 1) * 64);
      withOne.set(msg);
      withOne[l] = 0x80;
      const bits = l * 8;
      const dv = new DataView(withOne.buffer);
      dv.setUint32(withOne.length - 4, bits >>> 0, false);
      dv.setUint32(withOne.length - 8, Math.floor(bits / 0x100000000), false);
      const w = new Uint32Array(64);
      for (let off = 0; off < withOne.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = (e & f) ^ (~e & g);
          const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const t2 = (S0 + maj) >>> 0;
          hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
      }
      const out = new Uint8Array(32);
      for (let i = 0; i < 8; i++) new DataView(out.buffer).setUint32(i * 4, h[i], false);
      return out;
    }

    // --- Base58Check (legacy P2PKH/P2SH for BTC/PART/LTC/DOGE/DASH/...) ---
    function base58Decode(str) {
      let num = 0n;
      for (const ch of str) {
        const d = B58.indexOf(ch);
        if (d < 0) return null;
        num = num * 58n + BigInt(d);
      }
      const bytes = [];
      while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n; }
      for (let i = 0; i < str.length && str[i] === "1"; i++) bytes.unshift(0);
      return new Uint8Array(bytes);
    }
    function isBase58Check(address, allowedVersions) {
      const data = base58Decode(address);
      if (!data || data.length < 5) return false;
      const payload = data.slice(0, -4);
      const checksum = data.slice(-4);
      const h = sha256(sha256(payload));
      for (let i = 0; i < 4; i++) if (h[i] !== checksum[i]) return false;
      // If version bytes are given, the leading byte must match one (else it's
      // another coin's address); with none, checksum-only.
      if (allowedVersions && allowedVersions.length) {
        return allowedVersions.indexOf(payload[0]) !== -1;
      }
      return true;
    }

    // --- Bech32 / Bech32m (segwit: BTC bc1, LTC ltc1, PART pw1, ...) ---
    const BECH32_CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    function bech32Polymod(values) {
      const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
      let chk = 1;
      for (const v of values) {
        const top = chk >>> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
      }
      return chk >>> 0;
    }
    function isBech32(address, expectedHrp) {
      // A coin with no bech32 HRP (e.g. Dash/Firo/PIVX) has no segwit addresses.
      if (expectedHrp !== undefined && !expectedHrp) return false;
      const lower = address.toLowerCase();
      if (address !== lower && address !== address.toUpperCase()) return false; // mixed case
      const pos = lower.lastIndexOf("1");
      if (pos < 1 || pos + 7 > lower.length || lower.length > 90) return false;
      const hrp = lower.slice(0, pos);
      // The HRP identifies the coin; a valid checksum on the wrong HRP is another coin's.
      if (expectedHrp && hrp !== expectedHrp.toLowerCase()) return false;
      const data = [];
      for (const ch of lower.slice(pos + 1)) {
        const d = BECH32_CHARS.indexOf(ch);
        if (d < 0) return false;
        data.push(d);
      }
      const expanded = [];
      for (const ch of hrp) expanded.push(ch.charCodeAt(0) >> 5);
      expanded.push(0);
      for (const ch of hrp) expanded.push(ch.charCodeAt(0) & 31);
      const chk = bech32Polymod(expanded.concat(data));
      return chk === 1 || chk === 0x2bc830a3; // bech32 or bech32m
    }

    // --- CashAddr (Bitcoin Cash) ---
    function cashaddrPolymod(values) {
      const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
      let chk = 1n;
      for (const v of values) {
        const top = chk >> 35n;
        chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(v);
        for (let i = 0; i < 5; i++) if ((top >> BigInt(i)) & 1n) chk ^= GEN[i];
      }
      return chk ^ 1n;
    }
    function isCashaddr(address) {
      let lower = address.toLowerCase();
      let prefix = "bitcoincash";
      const colon = lower.indexOf(":");
      if (colon >= 0) { prefix = lower.slice(0, colon); lower = lower.slice(colon + 1); }
      const data = [];
      for (const ch of lower) {
        const d = BECH32_CHARS.indexOf(ch);
        if (d < 0) return false;
        data.push(d);
      }
      const expanded = [];
      for (const ch of prefix) expanded.push(ch.charCodeAt(0) & 31);
      expanded.push(0);
      return cashaddrPolymod(expanded.concat(data)) === 0n;
    }

    // true/false (authoritative) or null (no offline validator; server checks).
    // params: { coin, mode, hrp, versions, prefixes, script_type } from the server.
    function isValidAddressForCoin(address, params) {
      if (!address) return null; // empty allowed (optional field)
      params = params || {};
      const c = String(params.coin || "").toLowerCase();
      if (c.indexOf("monero") !== -1 || c.indexOf("wownero") !== -1) {
        return isValidMoneroAddress(address, params.prefixes);
      }
      if (c.indexOf("cash") !== -1) {
        return isCashaddr(address) || isBase58Check(address);
      }
      if (c.indexOf("decred") !== -1) {
        return null; // Decred uses a blake256 checksum; no offline validator here.
      }
      if (params.mode === "dest_af" && params.script_type) {
        // The redeem tx only pays script_type, so no other address form is safe.
        if (params.script_type === "p2wpkh") return isBech32(address, params.hrp);
        if (params.script_type === "p2pkh") {
          return isBase58Check(address, params.versions ? [params.versions[0]] : undefined);
        }
        return null;
      }
      return isBase58Check(address, params.versions) || isBech32(address, params.hrp);
    }

    return { isValidAddressForCoin, isValidMoneroAddress, isBase58Check, isBech32, isCashaddr, keccak256, sha256 };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AddressValidation;
  if (root) root.AddressValidation = AddressValidation;
})(typeof window !== "undefined" ? window : this);
