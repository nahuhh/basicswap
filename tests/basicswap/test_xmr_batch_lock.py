#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright (c) 2026 The Basicswap developers
# Distributed under the MIT software license, see the accompanying
# file LICENSE or http://www.opensource.org/licenses/mit-license.php.

import logging
import threading
import unittest

from basicswap.basicswap_util import BidStates
from basicswap.interface.xmr.xmr import XMRInterface
from basicswap.multibid import plan_batch_decision


def key(seed: int) -> bytes:
    return bytes([seed]) * 32


class FakeXmr:
    """Just enough of XMRInterface to exercise publishBLockTxs."""

    publishBLockTxs = XMRInterface.publishBLockTxs

    def __init__(self):
        self._mx_wallet = threading.Lock()
        self._wallet_filename = "wallet"
        self._addr_prefix = 18
        self._fee_priority = 0
        self._log = logging.getLogger("test")
        self._log.id = lambda v: v
        self.calls = []

    def openWallet(self, filename):
        self.calls.append(("openWallet", filename))

    def getPubkey(self, k: bytes) -> bytes:
        return k

    def rpc_wallet(self, method, params=None):
        self.calls.append((method, params))
        if method == "transfer":
            return {"tx_hash": "ab" * 32}
        return {}


class TestPublishBLockTxs(unittest.TestCase):

    def test_locks_every_swap_in_one_transfer(self):
        ci = FakeXmr()

        txid = ci.publishBLockTxs(
            [
                (key(1), key(2), 100),
                (key(3), key(4), 250),
                (key(5), key(6), 375),
            ]
        )

        self.assertEqual(txid, bytes.fromhex("ab" * 32))

        transfers = [params for method, params in ci.calls if method == "transfer"]
        self.assertEqual(len(transfers), 1)

        destinations = transfers[0]["destinations"]
        self.assertEqual([d["amount"] for d in destinations], [100, 250, 375])
        # One output per swap, each to that swap's own shared address.
        self.assertEqual(len({d["address"] for d in destinations}), 3)
        self.assertEqual(transfers[0]["unlock_time"], 0)

    def test_priority_is_passed_when_set(self):
        ci = FakeXmr()
        ci._fee_priority = 2

        ci.publishBLockTxs([(key(1), key(2), 100)], unlock_time=7)

        params = [p for method, p in ci.calls if method == "transfer"][0]
        self.assertEqual(params["priority"], 2)
        self.assertEqual(params["unlock_time"], 7)


class Leg:
    def __init__(
        self,
        bid_id: bytes,
        state,
        xmr_b_lock_tx=None,
        cohort=b"cohort",
        coin_a_seen=False,
        state_time=0,
        is_adaptor=True,
    ):
        self.bid_id = bid_id
        self.state = state
        self.xmr_b_lock_tx = xmr_b_lock_tx
        self.cohort = cohort
        self.coin_a_seen = coin_a_seen
        self.state_time = state_time
        self.is_adaptor = is_adaptor


READY = BidStates.XMR_SWAP_SCRIPT_COIN_LOCKED
WAITING = BidStates.XMR_SWAP_MSG_SCRIPT_LOCK_SPEND_TX


def decide(legs, bid_id=b"self", **kwargs):
    return plan_batch_decision(legs, bid_id, **kwargs)


class TestPlanBatchDecision(unittest.TestCase):

    def test_batches_ready_siblings_and_excludes_self(self):
        legs = [
            Leg(b"self", READY),
            Leg(b"sib1", READY),
            Leg(b"sib2", READY),
        ]
        plan = decide(legs)
        self.assertFalse(plan.wait)
        self.assertEqual([leg.bid_id for leg in plan.batch], [b"sib1", b"sib2"])
        self.assertEqual(plan.drop, [])

    def test_lone_leg_batches_nothing(self):
        plan = decide([Leg(b"self", READY)])
        self.assertFalse(plan.wait)
        self.assertEqual(plan.batch, [])

    def test_skips_a_sibling_that_already_locked_its_coin_b(self):
        legs = [
            Leg(b"self", READY),
            Leg(b"sib_done", READY, xmr_b_lock_tx=object()),
        ]
        self.assertEqual(decide(legs).batch, [])

    def test_waits_for_a_seen_but_unconfirmed_sibling(self):
        # Even long past the timeout, a leg whose coin A is seen is never dropped.
        legs = [
            Leg(b"self", READY, state_time=0),
            Leg(b"sib_wait", WAITING, coin_a_seen=True),
        ]
        plan = decide(legs, now=9999, ready_timeout=300)
        self.assertTrue(plan.wait)
        self.assertEqual(plan.drop, [])

    def test_waits_for_an_unseen_sibling_before_the_timeout(self):
        legs = [
            Leg(b"self", READY, state_time=900),
            Leg(b"sib_wait", WAITING, coin_a_seen=False),
        ]
        plan = decide(legs, now=1000, ready_timeout=300)  # held 100s < 300s
        self.assertTrue(plan.wait)
        self.assertEqual(plan.drop, [])

    def test_drops_an_unseen_straggler_once_a_ready_leg_waited(self):
        legs = [
            Leg(b"self", READY, state_time=0),
            Leg(b"sib_ready", READY),
            Leg(b"sib_stalled", WAITING, coin_a_seen=False),
        ]
        plan = decide(legs, now=1000, ready_timeout=300)  # held 1000s >= 300s
        self.assertFalse(plan.wait)  # nothing seen-but-pending left to wait for
        self.assertEqual([leg.bid_id for leg in plan.drop], [b"sib_stalled"])
        self.assertEqual([leg.bid_id for leg in plan.batch], [b"sib_ready"])

    def test_drops_an_unaccepted_straggler(self):
        # A leg the maker never accepted (still BID_SENT) has locked nothing, so
        # it is dropped once a ready sibling has waited, same as a stalled one.
        legs = [
            Leg(b"self", READY, state_time=0),
            Leg(b"sib_ready", READY),
            Leg(b"sib_unaccepted", BidStates.BID_SENT, coin_a_seen=False),
        ]
        plan = decide(legs, now=1000, ready_timeout=300)
        self.assertFalse(plan.wait)
        self.assertEqual([leg.bid_id for leg in plan.drop], [b"sib_unaccepted"])

    def test_drops_an_unaccepted_reverse_bid_request(self):
        # Reverse bids sit at BID_REQUEST_SENT before acceptance, the analog of
        # BID_SENT, and must drop the same way.
        legs = [
            Leg(b"self", READY, state_time=0),
            Leg(b"sib_ready", READY),
            Leg(b"sib_unaccepted", BidStates.BID_REQUEST_SENT, coin_a_seen=False),
        ]
        plan = decide(legs, now=1000, ready_timeout=300)
        self.assertEqual([leg.bid_id for leg in plan.drop], [b"sib_unaccepted"])

    def test_waits_for_an_unaccepted_straggler_before_the_timeout(self):
        legs = [
            Leg(b"self", READY, state_time=900),
            Leg(b"sib_unaccepted", BidStates.BID_SENT, coin_a_seen=False),
        ]
        plan = decide(legs, now=1000, ready_timeout=300)  # held 100s < 300s
        self.assertTrue(plan.wait)
        self.assertEqual(plan.drop, [])

    def test_ready_anchor_uses_the_longest_held_leg(self):
        # self only just became ready, but a sibling has been ready for ages, so
        # the unseen straggler is still cut.
        legs = [
            Leg(b"self", READY, state_time=990),
            Leg(b"sib_ready", READY, state_time=0),
            Leg(b"sib_stalled", WAITING, coin_a_seen=False),
        ]
        plan = decide(legs, now=1000, ready_timeout=300)
        self.assertEqual([leg.bid_id for leg in plan.drop], [b"sib_stalled"])

    def test_ignores_a_different_cohort(self):
        legs = [
            Leg(b"self", READY, cohort=b"A"),
            Leg(b"other", READY, cohort=b"B"),
            Leg(b"other_wait", WAITING, cohort=b"B", coin_a_seen=False),
        ]
        plan = decide(legs, now=9999, ready_timeout=1)
        self.assertFalse(plan.wait)
        self.assertEqual(plan.batch, [])  # cohort B is not ours
        self.assertEqual(plan.drop, [])

    def test_ignores_secret_hash_legs(self):
        # A secret-hash sibling shares BID_ACCEPTED but must not be waited on or
        # dropped by the adaptor-sig batch.
        legs = [
            Leg(b"self", READY, state_time=0),
            Leg(b"sh", BidStates.BID_ACCEPTED, coin_a_seen=False, is_adaptor=False),
        ]
        plan = decide(legs, now=9999, ready_timeout=1)
        self.assertFalse(plan.wait)
        self.assertEqual(plan.drop, [])
        self.assertEqual(plan.batch, [])

    def test_batch_is_capped_to_the_output_limit(self):
        legs = [Leg(b"self", READY)] + [Leg(bytes([i]), READY) for i in range(1, 6)]
        # cap 3 outputs => self + 2 siblings.
        plan = decide(legs, cap=3)
        self.assertEqual(len(plan.batch), 2)
        self.assertFalse(plan.wait)


if __name__ == "__main__":
    unittest.main()
