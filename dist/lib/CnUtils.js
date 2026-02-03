"use strict";
// Copyright (c) 2018-2020, Zpalmtree
//
// Please see the included LICENSE file for more information.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoUtils = void 0;
const turtlecoin_utils_1 = require("turtlecoin-utils");
const _ = require("lodash");
/** @ignore */
const cached = {};
/**
 * This needs to be a function, rather than a default export, since our config
 * can change when a user calls createWallet() with a non default config.
 * Due to how the module system works, a default export is cached and so the
 * config will never update.
 */
function CryptoUtils(config) {
    if (!_.isEqual(cached.config, config) || !cached.config || !cached.interface) {
        cached.config = config;
        if (!config.ledgerTransport) {
            cached.interface = new turtlecoin_utils_1.CryptoNote({
                addressPrefix: config.addressPrefix,
                coinUnitPlaces: config.decimalPlaces,
                keccakIterations: 1,
            }, {
                cn_fast_hash: config.cnFastHash,
                checkRingSignatures: config.checkRingSignatures,
                derivePublicKey: config.derivePublicKey,
                deriveSecretKey: config.deriveSecretKey,
                generateKeyDerivation: config.generateKeyDerivation,
                generateKeyImage: config.generateKeyImage,
                generateRingSignatures: config.generateRingSignatures,
                secretKeyToPublicKey: config.secretKeyToPublicKey,
                underivePublicKey: config.underivePublicKey,
            });
        }
        else {
            cached.interface = new turtlecoin_utils_1.LedgerNote(config.ledgerTransport, {
                addressPrefix: config.addressPrefix,
                coinUnitPlaces: config.decimalPlaces,
                keccakIterations: 1,
            }, {
                cn_fast_hash: config.cnFastHash,
                checkRingSignatures: config.checkRingSignatures,
                derivePublicKey: config.derivePublicKey,
                deriveSecretKey: config.deriveSecretKey,
                generateKeyDerivation: config.generateKeyDerivation,
                generateKeyImage: config.generateKeyImage,
                generateRingSignatures: config.generateRingSignatures,
                secretKeyToPublicKey: config.secretKeyToPublicKey,
                underivePublicKey: config.underivePublicKey,
            });
        }
        return cached.interface;
    }
    else {
        return cached.interface;
    }
}
exports.CryptoUtils = CryptoUtils;
