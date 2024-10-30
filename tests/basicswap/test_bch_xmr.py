#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2024 The Basicswap developers
# Distributed under the MIT software license, see the accompanying
# file LICENSE or http://www.opensource.org/licenses/mit-license.php.

import logging
import random
import unittest

from basicswap.chainparams import XMR_COIN
from basicswap.basicswap import (
    BidStates,
    Coins,
    SwapTypes,
)
from basicswap.util import (
    COIN,
)
from basicswap.util.crypto import sha256
from tests.basicswap.test_btc_xmr import BasicSwapTest
from tests.basicswap.common import (
    BCH_BASE_RPC_PORT,
    wait_for_bid,
    wait_for_offer,
)
from basicswap.contrib.test_framework.messages import (
    ToHex,
    CTxIn,
    COutPoint,
    CTransaction,
)
from basicswap.contrib.test_framework.script import (
    CScript,
    OP_EQUAL,
    OP_CHECKLOCKTIMEVERIFY,
    OP_CHECKSEQUENCEVERIFY,
)
from basicswap.interface.bch import BCHInterface
from basicswap.util import ensure
from .test_xmr import BaseTest, test_delay_event, callnoderpc

from coincurve.ecdsaotves import (
    ecdsaotves_enc_sign,
    ecdsaotves_enc_verify,
    ecdsaotves_dec_sig
)

logger = logging.getLogger()


bch_lock_spend_tx = '0200000001bfc6bbb47851441c7827059ae337a06aa9064da7f9537eb9243e45766c3dd34c00000000d8473045022100a0161ea14d3b41ed41250c8474fc8ec6ce1cab8df7f401e69ecf77c2ab63d82102207a2a57ddf2ea400e09ea059f3b261da96f5098858b17239931f3cc2fb929bb2a4c8ec3519dc4519d02e80300c600cc949d00ce00d18800cf00d28800d000d39d00cb641976a91481ec21969399d15c26af089d5db437ead066c5ba88ac00cd788821024ffcc0481629866671d89f05f3da813a2aacec1b52e69b8c0c586b665f5d4574ba6752b27523aa20df65a90e9becc316ff5aca44d4e06dfaade56622f32bafa197aba706c5e589758700cd87680000000001251cde06000000001976a91481ec21969399d15c26af089d5db437ead066c5ba88ac00000000'
bch_lock_script = 'c3519dc4519d02e80300c600cc949d00ce00d18800cf00d28800d000d39d00cb641976a91481ec21969399d15c26af089d5db437ead066c5ba88ac00cd788821024ffcc0481629866671d89f05f3da813a2aacec1b52e69b8c0c586b665f5d4574ba6752b27523aa20df65a90e9becc316ff5aca44d4e06dfaade56622f32bafa197aba706c5e589758700cd8768'
bch_lock_spend_script = '473045022100a0161ea14d3b41ed41250c8474fc8ec6ce1cab8df7f401e69ecf77c2ab63d82102207a2a57ddf2ea400e09ea059f3b261da96f5098858b17239931f3cc2fb929bb2a4c8ec3519dc4519d02e80300c600cc949d00ce00d18800cf00d28800d000d39d00cb641976a91481ec21969399d15c26af089d5db437ead066c5ba88ac00cd788821024ffcc0481629866671d89f05f3da813a2aacec1b52e69b8c0c586b665f5d4574ba6752b27523aa20df65a90e9becc316ff5aca44d4e06dfaade56622f32bafa197aba706c5e589758700cd8768'
bch_lock_swipe_script = '4c8fc3519dc4519d02e80300c600cc949d00ce00d18800cf00d28800d000d39d00cb641976a9141ab50aedd2e48297073f0f6eef46f97b37c9354e88ac00cd7888210234fe304a5b129b8265c177c92aa40b7840e8303f8b0fcca2359023163c7c2768ba670120b27523aa20191b09e40d1277fa14fea1e9b41e4fcc4528c9cb77e39e1b7b1a0b3332180cb78700cd8768'

coin_settings = {'rpcport': 0, 'rpcauth': 'none', 'blocks_confirmed': 1, 'conf_target': 1, 'use_segwit': False, 'connection_type': 'rpc'}


class TestXmrBchSwapInterface(unittest.TestCase):
    def test_extractScriptLockScriptValues(self):
        ci = BCHInterface(coin_settings, "regtest")

        script_bytes = CScript(bytes.fromhex(bch_lock_script))
        ci.extractScriptLockScriptValues(script_bytes)

        script_bytes = CScript(bytes.fromhex(bch_lock_spend_script))
        signature, mining_fee, out_1, out_2, public_key, timelock = ci.extractScriptLockScriptValuesFromScriptSig(script_bytes)
        ensure(signature is not None, 'signature not present')

        script_bytes = CScript(bytes.fromhex(bch_lock_swipe_script))
        signature, mining_fee, out_1, out_2, public_key, timelock = ci.extractScriptLockScriptValuesFromScriptSig(script_bytes)
        ensure(signature is None, 'signature present')


class TestFunctions(BaseTest):
    __test__ = False
    start_bch_nodes = True
    base_rpc_port = BCH_BASE_RPC_PORT
    extra_wait_time = 0
    test_coin_from = Coins.BCH

    def callnoderpc(self, method, params=[], wallet=None, node_id=0):
        return callnoderpc(node_id, method, params, wallet, self.base_rpc_port)

    def mineBlock(self, num_blocks=1):
        self.callnoderpc('generatetoaddress', [num_blocks, self.bch_addr])

    def test_05_bch_xmr(self):
        logging.info('---------- Test BCH to XMR')
        swap_clients = self.swap_clients
        offer_id = swap_clients[0].postOffer(Coins.BCH, Coins.XMR, 10 * COIN, 100 * XMR_COIN, 10 * COIN, SwapTypes.XMR_SWAP)
        wait_for_offer(test_delay_event, swap_clients[1], offer_id)
        offers = swap_clients[1].listOffers(filters={'offer_id': offer_id})
        offer = offers[0]

        swap_clients[1].ci(Coins.XMR).setFeePriority(3)

        bid_id = swap_clients[1].postXmrBid(offer_id, offer.amount_from)

        wait_for_bid(test_delay_event, swap_clients[0], bid_id, BidStates.BID_RECEIVED)

        bid, xmr_swap = swap_clients[0].getXmrBid(bid_id)
        assert (xmr_swap)

        swap_clients[0].acceptXmrBid(bid_id)

        wait_for_bid(test_delay_event, swap_clients[0], bid_id, BidStates.SWAP_COMPLETED, wait_for=180)
        wait_for_bid(test_delay_event, swap_clients[1], bid_id, BidStates.SWAP_COMPLETED, sent=True)

        swap_clients[1].ci(Coins.XMR).setFeePriority(0)


class TestBCH(BasicSwapTest):
    __test__ = True
    test_coin_from = Coins.BCH
    start_bch_nodes = True
    base_rpc_port = BCH_BASE_RPC_PORT

    def mineBlock(self, num_blocks=1):
        self.callnoderpc('generatetoaddress', [num_blocks, self.bch_addr])

    def check_softfork_active(self, feature_name):
        return True

    def test_001_nested_segwit(self):
        logging.info('---------- Test {} p2sh nested segwit'.format(self.test_coin_from.name))
        logging.info('Skipped')

    def test_002_native_segwit(self):
        logging.info('---------- Test {} p2sh native segwit'.format(self.test_coin_from.name))
        logging.info('Skipped')

    def test_003_cltv(self):
        logging.info('---------- Test {} cltv'.format(self.test_coin_from.name))

        ci = self.swap_clients[0].ci(self.test_coin_from)

        self.check_softfork_active('bip65')

        chain_height = self.callnoderpc('getblockcount')
        script = CScript([chain_height + 3, OP_CHECKLOCKTIMEVERIFY, ])

        script_dest = ci.getScriptDest(script)
        tx = CTransaction()
        tx.nVersion = ci.txVersion()
        tx.vout.append(ci.txoType()(ci.make_int(1.1), script_dest))
        tx_hex = ToHex(tx)
        tx_funded = ci.rpc_wallet('fundrawtransaction', [tx_hex])
        utxo_pos = 0 if tx_funded['changepos'] == 1 else 1
        tx_signed = ci.rpc_wallet('signrawtransactionwithwallet', [tx_funded['hex'], ])['hex']
        txid = ci.rpc('sendrawtransaction', [tx_signed, ])

        addr_out = ci.rpc_wallet('getnewaddress', ['cltv test'])
        pkh = ci.decodeAddress(addr_out)
        script_out = ci.getScriptForPubkeyHash(pkh)

        tx_spend = CTransaction()
        tx_spend.nVersion = ci.txVersion()
        tx_spend.nLockTime = chain_height + 3
        tx_spend.vin.append(CTxIn(COutPoint(int(txid, 16), utxo_pos), scriptSig=CScript([script,])))
        tx_spend.vout.append(ci.txoType()(ci.make_int(1.0999), script_out))
        tx_spend_hex = ToHex(tx_spend)

        tx_spend.nLockTime = chain_height + 2
        tx_spend_invalid_hex = ToHex(tx_spend)

        for tx_hex in [tx_spend_invalid_hex, tx_spend_hex]:
            try:
                txid = self.callnoderpc('sendrawtransaction', [tx_hex, ])
            except Exception as e:
                assert ('non-final' in str(e))
            else:
                assert False, 'Should fail'

        self.mineBlock(5)
        try:
            txid = ci.rpc('sendrawtransaction', [tx_spend_invalid_hex, ])
        except Exception as e:
            assert ('Locktime requirement not satisfied' in str(e))
        else:
            assert False, 'Should fail'

        txid = ci.rpc('sendrawtransaction', [tx_spend_hex, ])
        self.mineBlock()
        ro = ci.rpc_wallet('listreceivedbyaddress', [0, ])
        sum_addr = 0
        for entry in ro:
            if entry['address'] == addr_out:
                sum_addr += entry['amount']
        assert (sum_addr == 1.0999)

        # Ensure tx was mined
        tx_wallet = ci.rpc_wallet('gettransaction', [txid, ])
        assert (len(tx_wallet['blockhash']) == 64)

    def test_004_csv(self):
        logging.info('---------- Test {} csv'.format(self.test_coin_from.name))

        swap_clients = self.swap_clients
        ci = self.swap_clients[0].ci(self.test_coin_from)

        self.check_softfork_active('csv')

        script = CScript([3, OP_CHECKSEQUENCEVERIFY, ])

        script_dest = ci.getScriptDest(script)
        tx = CTransaction()
        tx.nVersion = ci.txVersion()
        tx.vout.append(ci.txoType()(ci.make_int(1.1), script_dest))
        tx_hex = ToHex(tx)
        tx_funded = ci.rpc_wallet('fundrawtransaction', [tx_hex])
        utxo_pos = 0 if tx_funded['changepos'] == 1 else 1
        tx_signed = ci.rpc_wallet('signrawtransactionwithwallet', [tx_funded['hex'], ])['hex']
        txid = ci.rpc('sendrawtransaction', [tx_signed, ])

        addr_out = ci.rpc_wallet('getnewaddress', ['csv test'])
        pkh = ci.decodeAddress(addr_out)
        script_out = ci.getScriptForPubkeyHash(pkh)

        # Double check output type
        prev_tx = ci.rpc('decoderawtransaction', [tx_signed, ])
        assert (prev_tx['vout'][utxo_pos]['scriptPubKey']['type'] == 'scripthash')

        tx_spend = CTransaction()
        tx_spend.nVersion = ci.txVersion()
        tx_spend.vin.append(CTxIn(COutPoint(int(txid, 16), utxo_pos),
                            nSequence=3,
                            scriptSig=CScript([script,])))
        tx_spend.vout.append(ci.txoType()(ci.make_int(1.0999), script_out))
        tx_spend_hex = ToHex(tx_spend)
        try:
            txid = ci.rpc('sendrawtransaction', [tx_spend_hex, ])
        except Exception as e:
            assert ('non-BIP68-final' in str(e))
        else:
            assert False, 'Should fail'

        self.mineBlock(3)
        txid = ci.rpc('sendrawtransaction', [tx_spend_hex, ])
        self.mineBlock(1)
        ro = ci.rpc_wallet('listreceivedbyaddress', [0, ])
        sum_addr = 0
        for entry in ro:
            if entry['address'] == addr_out:
                sum_addr += entry['amount']
        assert (sum_addr == 1.0999)

        # Ensure tx was mined
        tx_wallet = ci.rpc_wallet('gettransaction', [txid, ])
        assert (len(tx_wallet['blockhash']) == 64)

    def test_005_watchonly(self):
        logging.info('---------- Test {} watchonly'.format(self.test_coin_from.name))
        ci = self.swap_clients[0].ci(self.test_coin_from)
        ci1 = self.swap_clients[1].ci(self.test_coin_from)

        addr = ci.rpc_wallet('getnewaddress', ['watchonly test'])
        ro = ci1.rpc_wallet('importaddress', [addr, '', False])
        txid = ci.rpc_wallet('sendtoaddress', [addr, 1.0])
        tx_hex = ci.rpc('getrawtransaction', [txid, ])
        ci1.rpc_wallet('sendrawtransaction', [tx_hex, ])
        ro = ci1.rpc_wallet('gettransaction', [txid, ])
        assert (ro['txid'] == txid)

    def test_006_getblock_verbosity(self):
        super().test_006_getblock_verbosity()

    def test_007_hdwallet(self):
        logging.info('---------- Test {} hdwallet'.format(self.test_coin_from.name))

        test_seed = '8e54a313e6df8918df6d758fafdbf127a115175fdd2238d0e908dd8093c9ac3b'
        test_wif = self.swap_clients[0].ci(self.test_coin_from).encodeKey(bytes.fromhex(test_seed))
        new_wallet_name = random.randbytes(10).hex()
        self.callnoderpc('createwallet', [new_wallet_name])
        self.callnoderpc('sethdseed', [True, test_wif], wallet=new_wallet_name)
        addr = self.callnoderpc('getnewaddress', wallet=new_wallet_name)
        self.callnoderpc('unloadwallet', [new_wallet_name])
        assert (addr == 'bchreg:qqxr67wf5ltty5jvm44zryywmpt7ntdaa50carjt59')

    def test_008_gettxout(self):
        super().test_008_gettxout()

    def test_009_scantxoutset(self):
        super().test_009_scantxoutset()

    def test_010_txn_size(self):
        logging.info('---------- Test {} txn_size'.format(Coins.BCH))

        swap_clients = self.swap_clients
        ci = swap_clients[0].ci(Coins.BCH)
        pi = swap_clients[0].pi(SwapTypes.XMR_SWAP)

        amount: int = ci.make_int(random.uniform(0.1, 2.0), r=1)

        # Record unspents before createSCLockTx as the used ones will be locked
        unspents = ci.rpc('listunspent')

        # fee_rate is in sats/B
        fee_rate: int = 1

        a = ci.getNewSecretKey()
        b = ci.getNewSecretKey()

        A = ci.getPubkey(a)
        B = ci.getPubkey(b)

        mining_fee = 1000
        timelock = 2
        b_receive = ci.getNewAddress()
        a_refund = ci.getNewAddress()

        refundExtraArgs = dict()
        lockExtraArgs = dict()

        refundExtraArgs['mining_fee'] = 1000
        refundExtraArgs['out_1'] = ci.addressToLockingBytecode(a_refund)
        refundExtraArgs['out_2'] = ci.addressToLockingBytecode(b_receive)
        refundExtraArgs['public_key'] = B
        refundExtraArgs['timelock'] = 5

        refund_lock_tx_script = pi.genScriptLockTxScript(ci, A, B, **refundExtraArgs)
        # will make use of this in `createSCLockRefundTx`
        refundExtraArgs['refund_lock_tx_script'] = refund_lock_tx_script

        # lock script
        lockExtraArgs['mining_fee'] = 1000
        lockExtraArgs['out_1'] = ci.addressToLockingBytecode(b_receive)
        lockExtraArgs['out_2'] = ci.scriptToP2SH32LockingBytecode(refund_lock_tx_script)
        lockExtraArgs['public_key'] = A
        lockExtraArgs['timelock'] = 2

        lock_tx_script = pi.genScriptLockTxScript(ci, A, B, **lockExtraArgs)

        lock_tx = ci.createSCLockTx(amount, lock_tx_script)
        lock_tx = ci.fundSCLockTx(lock_tx, fee_rate)
        lock_tx = ci.signTxWithWallet(lock_tx)
        print(lock_tx.hex())

        unspents_after = ci.rpc('listunspent')
        assert (len(unspents) > len(unspents_after))

        tx_decoded = ci.rpc('decoderawtransaction', [lock_tx.hex()])
        txid = tx_decoded['txid']

        vsize = tx_decoded['size']
        expect_fee_int = round(fee_rate * vsize)
        expect_fee = ci.format_amount(expect_fee_int)

        out_value: int = 0
        for txo in tx_decoded['vout']:
            if 'value' in txo:
                out_value += ci.make_int(txo['value'])
        in_value: int = 0
        for txi in tx_decoded['vin']:
            for utxo in unspents:
                if 'vout' not in utxo:
                    continue
                if utxo['txid'] == txi['txid'] and utxo['vout'] == txi['vout']:
                    in_value += ci.make_int(utxo['amount'])
                    break
        fee_value = in_value - out_value

        ci.rpc('sendrawtransaction', [lock_tx.hex()])
        rv = ci.rpc('gettransaction', [txid])
        wallet_tx_fee = -ci.make_int(rv['fee'])

        assert (wallet_tx_fee == fee_value)
        assert (wallet_tx_fee == expect_fee_int)

        pkh_out = ci.decodeAddress(b_receive)

        msg = sha256(ci.addressToLockingBytecode(b_receive))

        # leader creates an adaptor signature for follower and transmits it to the follower
        aAdaptorSig = ecdsaotves_enc_sign(a, B, msg)

        # alice verifies the adaptor signature
        assert (ecdsaotves_enc_verify(A, B, msg, aAdaptorSig))

        # alice decrypts the adaptor signature
        aAdaptorSig_dec = ecdsaotves_dec_sig(b, aAdaptorSig)

        fee_info = {}
        lock_spend_tx = ci.createSCLockSpendTx(lock_tx, lock_tx_script, pkh_out, mining_fee, fee_info=fee_info, ves=aAdaptorSig_dec)
        vsize_estimated: int = fee_info['vsize']

        tx_decoded = ci.rpc('decoderawtransaction', [lock_spend_tx.hex()])
        print('lock_spend_tx', lock_spend_tx.hex(), '\n', 'tx_decoded', tx_decoded)
        txid = tx_decoded['txid']

        tx_decoded = ci.rpc('decoderawtransaction', [lock_spend_tx.hex()])
        vsize_actual: int = tx_decoded['size']

        assert (vsize_actual <= vsize_estimated and vsize_estimated - vsize_actual < 4)
        assert (ci.rpc('sendrawtransaction', [lock_spend_tx.hex()]) == txid)

        expect_size: int = ci.xmr_swap_a_lock_spend_tx_vsize()
        assert (expect_size >= vsize_actual)
        assert (expect_size - vsize_actual < 10)

    def test_011_p2sh(self):
        # Not used in bsx for native-segwit coins
        logging.info('---------- Test {} p2sh'.format(self.test_coin_from.name))

        swap_clients = self.swap_clients
        ci = self.swap_clients[0].ci(self.test_coin_from)

        script = CScript([2, 2, OP_EQUAL, ])

        script_dest = ci.get_p2sh_script_pubkey(script)
        tx = CTransaction()
        tx.nVersion = ci.txVersion()
        tx.vout.append(ci.txoType()(ci.make_int(1.1), script_dest))
        tx_hex = ToHex(tx)
        tx_funded = ci.rpc_wallet('fundrawtransaction', [tx_hex])
        utxo_pos = 0 if tx_funded['changepos'] == 1 else 1
        tx_signed = ci.rpc_wallet('signrawtransactionwithwallet', [tx_funded['hex'], ])['hex']
        txid = ci.rpc('sendrawtransaction', [tx_signed, ])

        addr_out = ci.rpc_wallet('getnewaddress', ['csv test'])
        pkh = ci.decodeAddress(addr_out)
        script_out = ci.getScriptForPubkeyHash(pkh)

        # Double check output type
        prev_tx = ci.rpc('decoderawtransaction', [tx_signed, ])
        assert (prev_tx['vout'][utxo_pos]['scriptPubKey']['type'] == 'scripthash')

        tx_spend = CTransaction()
        tx_spend.nVersion = ci.txVersion()
        tx_spend.vin.append(CTxIn(COutPoint(int(txid, 16), utxo_pos),
                            scriptSig=CScript([script,])))
        tx_spend.vout.append(ci.txoType()(ci.make_int(1.0999), script_out))
        tx_spend_hex = ToHex(tx_spend)

        txid = ci.rpc('sendrawtransaction', [tx_spend_hex, ])
        self.mineBlock(1)
        ro = ci.rpc_wallet('listreceivedbyaddress', [0, ])
        sum_addr = 0
        for entry in ro:
            if entry['address'] == addr_out:
                sum_addr += entry['amount']
        assert (sum_addr == 1.0999)

        # Ensure tx was mined
        tx_wallet = ci.rpc_wallet('gettransaction', [txid, ])
        assert (len(tx_wallet['blockhash']) == 64)

    def test_011_p2sh32(self):
        # Not used in bsx for native-segwit coins
        logging.info('---------- Test {} p2sh32'.format(self.test_coin_from.name))

        swap_clients = self.swap_clients
        ci = self.swap_clients[0].ci(self.test_coin_from)

        script = CScript([2, 2, OP_EQUAL, ])

        script_dest = ci.scriptToP2SH32LockingBytecode(script)
        tx = CTransaction()
        tx.nVersion = ci.txVersion()
        tx.vout.append(ci.txoType()(ci.make_int(1.1), script_dest))
        tx_hex = ToHex(tx)
        tx_funded = ci.rpc_wallet('fundrawtransaction', [tx_hex])
        utxo_pos = 0 if tx_funded['changepos'] == 1 else 1
        tx_signed = ci.rpc_wallet('signrawtransactionwithwallet', [tx_funded['hex'], ])['hex']
        txid = ci.rpc('sendrawtransaction', [tx_signed, ])

        addr_out = ci.rpc_wallet('getnewaddress', ['csv test'])
        pkh = ci.decodeAddress(addr_out)
        script_out = ci.getScriptForPubkeyHash(pkh)

        # Double check output type
        prev_tx = ci.rpc('decoderawtransaction', [tx_signed, ])
        assert (prev_tx['vout'][utxo_pos]['scriptPubKey']['type'] == 'scripthash')

        tx_spend = CTransaction()
        tx_spend.nVersion = ci.txVersion()
        tx_spend.vin.append(CTxIn(COutPoint(int(txid, 16), utxo_pos),
                            scriptSig=CScript([script,])))
        tx_spend.vout.append(ci.txoType()(ci.make_int(1.0999), script_out))
        tx_spend_hex = ToHex(tx_spend)

        txid = ci.rpc('sendrawtransaction', [tx_spend_hex, ])
        self.mineBlock(1)
        ro = ci.rpc_wallet('listreceivedbyaddress', [0, ])
        sum_addr = 0
        for entry in ro:
            if entry['address'] == addr_out:
                sum_addr += entry['amount']
        assert (sum_addr == 1.0999)

        # Ensure tx was mined
        tx_wallet = ci.rpc_wallet('gettransaction', [txid, ])
        assert (len(tx_wallet['blockhash']) == 64)

    def test_012_p2sh_p2wsh(self):
        logging.info('---------- Test {} p2sh-p2wsh'.format(self.test_coin_from.name))
        logging.info('Skipped')

    def test_01_a_full_swap(self):
        super().test_01_a_full_swap()

    def test_01_b_full_swap_reverse(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_01_b_full_swap_reverse()

    def test_01_c_full_swap_to_part(self):
        super().test_01_c_full_swap_to_part()

    def test_01_d_full_swap_from_part(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_01_d_full_swap_from_part()

    def test_02_a_leader_recover_a_lock_tx(self):
        super().test_02_a_leader_recover_a_lock_tx()

    def test_03_a_follower_recover_a_lock_tx(self):
        super().test_03_a_follower_recover_a_lock_tx()

    def test_03_b_follower_recover_a_lock_tx_reverse(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_03_b_follower_recover_a_lock_tx_reverse()

    def test_03_c_follower_recover_a_lock_tx_to_part(self):
        super().test_03_c_follower_recover_a_lock_tx_to_part()

    def test_03_d_follower_recover_a_lock_tx_from_part(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_03_d_follower_recover_a_lock_tx_from_part()

    def test_04_a_follower_recover_b_lock_tx(self):
        super().test_04_a_follower_recover_b_lock_tx()

    def test_04_b_follower_recover_b_lock_tx_reverse(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_04_b_follower_recover_b_lock_tx_reverse()

    def test_04_c_follower_recover_b_lock_tx_to_part(self):
        super().test_04_c_follower_recover_b_lock_tx_to_part()

    def test_04_d_follower_recover_b_lock_tx_from_part(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_04_d_follower_recover_b_lock_tx_from_part()

    def test_05_self_bid(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_05_self_bid()

    def test_05_self_bid_to_part(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_05_self_bid_to_part()

    def test_05_self_bid_from_part(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_05_self_bid_from_part()

    def test_05_self_bid_rev(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_05_self_bid_rev()

    def test_06_preselect_inputs(self):
        tla_from = self.test_coin_from.name
        logging.info('---------- Test {} Preselected inputs'.format(tla_from))
        logging.info('Skipped')

    def test_07_expire_stuck_accepted(self):
        super().test_07_expire_stuck_accepted()

    def test_08_insufficient_funds(self):
        super().test_08_insufficient_funds()

    def test_08_insufficient_funds_rev(self):
        self.prepare_balance(Coins.BCH, 100.0, 1801, 1800)
        super().test_08_insufficient_funds_rev()