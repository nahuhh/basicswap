// Unit tests for the shared client-side destination-address validator in
// basicswap/static/js/modules/address-validation.js (used by the offer and
// settings pages).
//
//   node tests/basicswap/test_address_validation.js

const assert = require("assert");
const A = require("../../basicswap/static/js/modules/address-validation.js");

const hex = (b) => Buffer.from(b).toString("hex");
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log("ok   - " + name);
}

// Params as getAddressValidationParams() renders them onto the input.
const XMR_P = { coin: "Monero", mode: "any", prefixes: [18, 42] };
const WOW_P = { coin: "Wownero", mode: "dest_bl", prefixes: [4146, 12208] };
const BTC = { coin: "Bitcoin", mode: "any", hrp: "bc", versions: [0, 5], script_type: "p2wpkh" };
const BTC_AF = { coin: "Bitcoin", mode: "dest_af", hrp: "bc", versions: [0, 5], script_type: "p2wpkh" };
const PART_AF = { coin: "Particl", mode: "dest_af", hrp: "pw", versions: [56, 60], script_type: "p2pkh" };
const LTC = { coin: "Litecoin", mode: "any", hrp: "ltc", versions: [48, 5, 50], script_type: "p2wpkh" };
const BCH = { coin: "Bitcoin Cash", mode: "any" };
const DCR = { coin: "Decred", mode: "any" };

// Keccak-256 (pre-NIST, as used by CryptoNote) known vectors.
check("keccak256 empty string", () => {
  assert.strictEqual(
    hex(A.keccak256(new Uint8Array([]))),
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
  );
});
check("keccak256 'abc'", () => {
  assert.strictEqual(
    hex(A.keccak256(new TextEncoder().encode("abc"))),
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
  );
});
check("sha256 known vectors", () => {
  assert.strictEqual(
    hex(A.sha256(new Uint8Array([]))),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  assert.strictEqual(
    hex(A.sha256(new TextEncoder().encode("abc"))),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

// Monero mainnet address (the project donation address).
const XMR = "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A";
// Generated with basicswap.util_xmr.encode_address(K, K, prefix).
const XMR_SUB = "85pgLzobSxH2pvWUuqdETP3Whp9imF6fCWbp1pcWppFdhY5D8SaF4Tj2pvWUuqdETP3Whp9imF6fCWbp1pcWppFdUN5Jyxt";
const XMR_INTEGRATED = "4EhD2RyFToP2pvWUuqdETP3Whp9imF6fCWbp1pcWppFdhY5D8SaF4Tj2pvWUuqdETP3Whp9imF6fCWbp1pcWppFdUMetxoU";
const WOW = "Wo3q8Zwavae5MeVFXY4Ybw8hpxH6ZkCUEK1jwTHzsThFXGQk4xL4bKx5MeVFXY4Ybw8hpxH6ZkCUEK1jwTHzsThF2Z78CbhUm";
const WOW_SUB = "WW2xNnXeSi65MeVFXY4Ybw8hpxH6ZkCUEK1jwTHzsThFXGQk4xL4bKx5MeVFXY4Ybw8hpxH6ZkCUEK1jwTHzsThF2Z7AAg7Rh";

check("monero main and subaddress accepted", () => {
  assert.strictEqual(A.isValidMoneroAddress(XMR, XMR_P.prefixes), true);
  assert.strictEqual(A.isValidMoneroAddress(XMR_SUB, XMR_P.prefixes), true);
});
check("wownero main and subaddress accepted (2-byte varint prefix)", () => {
  // WOW's 4146 prefix encodes to two bytes, so the payload is 70 bytes, not 69.
  assert.strictEqual(A.isValidMoneroAddress(WOW, WOW_P.prefixes), true);
  assert.strictEqual(A.isValidMoneroAddress(WOW_SUB, WOW_P.prefixes), true);
});
check("integrated address rejected (server's decode_address rejects it too)", () => {
  assert.strictEqual(A.isValidMoneroAddress(XMR_INTEGRATED, XMR_P.prefixes), false);
});
check("monero address with one char changed fails checksum", () => {
  const tampered = XMR.slice(0, -1) + (XMR.slice(-1) === "A" ? "B" : "A");
  assert.strictEqual(A.isValidMoneroAddress(tampered, XMR_P.prefixes), false);
});
check("truncated monero address fails", () => {
  assert.strictEqual(A.isValidMoneroAddress(XMR.slice(0, 40), XMR_P.prefixes), false);
});
check("monero address with invalid base58 char fails", () => {
  assert.strictEqual(A.isValidMoneroAddress(XMR.slice(0, -1) + "0", XMR_P.prefixes), false);
});
check("cross-coin: prefix must match the coin", () => {
  assert.strictEqual(A.isValidAddressForCoin(XMR, WOW_P), false);
  assert.strictEqual(A.isValidAddressForCoin(WOW, XMR_P), false);
});

// isValidAddressForCoin dispatch + optional-empty handling.
check("empty address returns null (optional field)", () => {
  assert.strictEqual(A.isValidAddressForCoin("", XMR_P), null);
});
check("monero coin dispatches to checksum validator", () => {
  assert.strictEqual(A.isValidAddressForCoin(XMR, XMR_P), true);
  assert.strictEqual(A.isValidAddressForCoin("notanaddress", XMR_P), false);
});
check("BTC base58check: valid true, tampered/junk false (authoritative)", () => {
  assert.strictEqual(A.isValidAddressForCoin("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", BTC), true);
  assert.strictEqual(A.isValidAddressForCoin("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", BTC), false);
  assert.strictEqual(A.isValidAddressForCoin("bad addr!!", BTC), false);
});
check("BTC bech32/bech32m: valid true, tampered false", () => {
  assert.strictEqual(A.isValidAddressForCoin("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", BTC), true);
  assert.strictEqual(
    A.isValidAddressForCoin("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", BTC),
    true
  );
  assert.strictEqual(A.isValidAddressForCoin("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", BTC), false);
});
check("cross-coin bech32: HRP must match the coin (the reported bug)", () => {
  const BTC_BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
  const LTC_BECH32 = "ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9";
  assert.strictEqual(A.isValidAddressForCoin(BTC_BECH32, LTC), false);
  assert.strictEqual(A.isValidAddressForCoin(LTC_BECH32, LTC), true);
  assert.strictEqual(A.isValidAddressForCoin(LTC_BECH32, BTC), false);
});
check("base58 version byte must match the coin", () => {
  assert.strictEqual(A.isValidAddressForCoin("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", LTC), false);
});

// dest_af mirrors BasicSwap.isValidSwapDestAddress: the ADS redeem tx pays
// getScriptForPubkeyHash(dest_af), so only that address form is payable.
check("dest_af on a p2wpkh coin accepts only bech32", () => {
  assert.strictEqual(A.isValidAddressForCoin("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", BTC_AF), true);
  // p2sh would be paid as p2wpkh of a script hash: unspendable.
  assert.strictEqual(A.isValidAddressForCoin("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", BTC_AF), false);
  assert.strictEqual(A.isValidAddressForCoin("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", BTC_AF), false);
});
check("dest_af on a p2pkh coin accepts only the pubkey_address version", () => {
  assert.strictEqual(A.isValidAddressForCoin("PZdYWHgyhuG7NHVCzEkkx3dcLKurTpvmo6", PART_AF), true);
  assert.strictEqual(A.isValidAddressForCoin("pw1qw508d6qejxtdg4y5r3zarvary0c5xw7k8txr0n", PART_AF), false);
});
check("scripted swaps ('any') accept a legacy address the ADS redeem could not pay", () => {
  assert.strictEqual(A.isValidAddressForCoin("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", BTC), true);
});

check("BCH cashaddr: valid (prefixed and bare) true, tampered false", () => {
  assert.strictEqual(A.isValidAddressForCoin("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a", BCH), true);
  assert.strictEqual(A.isValidAddressForCoin("qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a", BCH), true);
  assert.strictEqual(A.isValidAddressForCoin("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6b", BCH), false);
});
check("monero invalid is authoritative false; Decred is advisory null", () => {
  assert.strictEqual(A.isValidAddressForCoin("notanaddress", XMR_P), false);
  assert.strictEqual(A.isValidAddressForCoin("Dsunvalidatedoffline", DCR), null);
});

console.log("\n" + passed + " passed");
