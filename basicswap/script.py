# -*- coding: utf-8 -*-

# Copyright (c) 2019-2022 tecnovert
# Distributed under the MIT software license, see the accompanying
# file LICENSE or http://www.opensource.org/licenses/mit-license.php.

from enum import IntEnum


class OpCodes(IntEnum):
    OP_0 = (0x00,)
    OP_PUSHDATA1 = (0x4C,)
    OP_1 = (0x51,)
    OP_16 = (0x60,)
    OP_IF = (0x63,)
    OP_ELSE = (0x67,)
    OP_ENDIF = (0x68,)
    OP_RETURN = (0x6A,)
    OP_DROP = (0x75,)
    OP_DUP = (0x76,)
    OP_SIZE = (0x82,)
    OP_EQUAL = (0x87,)
    OP_EQUALVERIFY = (0x88,)
    OP_SHA256 = (0xA8,)
    OP_HASH160 = (0xA9,)
    OP_CHECKSIG = (0xAC,)
    OP_CHECKLOCKTIMEVERIFY = (0xB1,)
    OP_CHECKSEQUENCEVERIFY = (0xB2,)

    OP_SHA256_DECRED = (0xC0,)
