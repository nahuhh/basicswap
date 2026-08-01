#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2026 The Basicswap developers
# Distributed under the MIT software license, see the accompanying
# file LICENSE or http://www.opensource.org/licenses/mit-license.php.

import threading
import unittest

from basicswap.contrib.test_framework.messages import CTransaction, CTxOut
from basicswap.interface.btc.btc import BTCInterface

DUST_TXID = "0102030405060708" * 4
CHANGE_TXID = "1122334455667788" * 4


class StubLog:
    def id(self, v, **kwargs):
        return str(v)

    def error(self, *args, **kwargs):
        pass

    def warning(self, *args, **kwargs):
        pass

    def debug(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass

    def info_s(self, *args, **kwargs):
        pass


class StubWalletManager:
    def __init__(self, signable, change_addr):
        self._signable = signable
        self._change_addr = change_addr
        self.locked = []

    def getSignableAddresses(self, coin_type):
        return dict(self._signable)

    def isUTXOLocked(self, coin_type, txid, vout, cursor=None):
        return False

    def getNewInternalAddress(self, coin_type):
        return self._change_addr

    def lockUTXO(self, coin_type, txid, vout, **kwargs):
        self.locked.append((txid, vout))
        return True


class StubBackend:
    def __init__(self, utxos_by_scripthash):
        self._utxos = utxos_by_scripthash
        self.queried = None

    def getBatchUnspent(self, scripthashes, min_confirmations=0):
        self.queried = list(scripthashes)
        return {sh: list(self._utxos.get(sh, [])) for sh in scripthashes}


def _make_interface(wm, backend):
    ci = BTCInterface.__new__(BTCInterface)
    ci._log = StubLog()
    ci._network = "mainnet"
    ci._connection_type = "electrum"
    ci._backend = backend
    ci._wallet_manager = wm
    ci._utxo_reserve_lock = threading.Lock()
    ci._pending_utxos_lock = threading.Lock()
    ci._pending_utxos_map = {}
    return ci


def _address_for(ci, tag: bytes) -> str:
    pk = bytes([0x02]) + tag.ljust(32, b"\x00")
    return ci.pubkey_to_segwit_address(pk)


class TestFundTxElectrumAddressSelection(unittest.TestCase):
    """Coin selection must draw on every signable address. Change lands on a
    freshly derived address that is inserted flagged unfunded, so filtering
    candidates on is_funded strands it and withdrawals fail with 'Insufficient
    funds' while the displayed balance still counts it."""

    def setUp(self):
        probe = BTCInterface.__new__(BTCInterface)
        probe._network = "mainnet"

        self.old_addr = _address_for(probe, b"old")
        self.change_addr = _address_for(probe, b"change")
        self.next_change_addr = _address_for(probe, b"next")

        self.old_sh = probe.addressToScripthash(self.old_addr)
        self.change_sh = probe.addressToScripthash(self.change_addr)

        # Dust left on an address flagged funded long ago, and the real balance
        # sitting on change that no balance sync has flagged yet.
        self.backend = StubBackend(
            {
                self.old_sh: [
                    {"txid": DUST_TXID, "vout": 0, "value": 41093, "confirmations": 10}
                ],
                self.change_sh: [
                    {
                        "txid": CHANGE_TXID,
                        "vout": 1,
                        "value": 8_500_000,
                        "confirmations": 6,
                    }
                ],
            }
        )
        self.wm = StubWalletManager(
            {self.old_addr: self.old_sh, self.change_addr: self.change_sh},
            self.next_change_addr,
        )
        self.ci = _make_interface(self.wm, self.backend)

    def _payment_tx(self, amount: int) -> bytes:
        tx = CTransaction()
        tx.nVersion = self.ci.txVersion()
        tx.vout.append(
            CTxOut(
                amount,
                self.ci.getScriptForPubkeyHash(self.ci.decodeAddress(self.old_addr)),
            )
        )
        return tx.serialize()

    def test_funds_from_unflagged_change_address(self):
        funded = self.ci._fundTxElectrum(self._payment_tx(8_091_400), 1000)

        tx = self.ci.loadTx(funded)
        spent = {
            (vin.prevout.hash.to_bytes(32, "little")[::-1].hex(), vin.prevout.n)
            for vin in tx.vin
        }
        self.assertIn((CHANGE_TXID, 1), spent)

    def test_queries_every_signable_scripthash(self):
        self.ci._fundTxElectrum(self._payment_tx(20_000), 1000)

        self.assertEqual(set(self.backend.queried), {self.old_sh, self.change_sh})

    def test_insufficient_when_change_address_omitted(self):
        # Reproduces the pre-fix behaviour: restricting candidates to the
        # historically flagged address leaves only dust to spend.
        self.wm._signable = {self.old_addr: self.old_sh}

        with self.assertRaises(ValueError) as ctx:
            self.ci._fundTxElectrum(self._payment_tx(8_091_400), 1000)
        self.assertIn("Insufficient funds", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
