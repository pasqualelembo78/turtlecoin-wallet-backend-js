"use strict";

const axios = require("axios");
const { generateKeyDerivation, underivePublicKey } = require("./CryptoWrapper");
const { isInputUnlocked } = require("./Utilities");
const { Config } = require("./Config");

async function calculateOnChainBalance(wallet, opts = {}) {
    if (!wallet) {
        throw new Error("calculateOnChainBalance: wallet object is required as first parameter");
    }

    const PRIVATE_VIEW_KEY = wallet.getPrivateViewKey ? wallet.getPrivateViewKey() : wallet.privateViewKey;
    
const PUBLIC_SPEND_KEY =
    wallet.getPublicSpendKey
        ? wallet.getPublicSpendKey()
        : wallet.publicSpendKey || wallet.publicSpendKeyHex;

    if (!PRIVATE_VIEW_KEY || !PUBLIC_SPEND_KEY) {
        throw new Error("calculateOnChainBalance: missing privateViewKey or publicSpendKey on wallet");
    }

    const daemonUrl = opts.daemonUrl || "http://82.165.218.56:17081/getwalletsyncdata";
    const timeout = opts.timeoutMs || 15000;
    const config = new Config();

    let response;
    try {
        response = await axios.post(
            daemonUrl,
            {
                blockCount: opts.blockCount || 100,
                blockHashCheckpoints: opts.blockHashCheckpoints || [],
                skipCoinbaseTransactions: opts.skipCoinbaseTransactions === true,
                startHeight: opts.startHeight || 0,
                startTimestamp: opts.startTimestamp || 0
            },
            { timeout }
        );
    } catch (err) {
        const msg = err && err.response ? `HTTP ${err.response.status}` : (err && err.message ? err.message : String(err));
        throw new Error(`Failed to fetch blocks from daemon (${daemonUrl}): ${msg}`);
    }

    const items = (response && response.data && Array.isArray(response.data.items)) ? response.data.items : [];
    let unlocked = 0;
    let locked = 0;

    for (const block of items) {
        // Accept different field names
        const blockHeight = block.blockHeight || block.block_height || block.height || 0;

        // Gather txs (coinbase + normal txs)
        const txs = [];
        if (block.coinbaseTX || block.coinbaseTx || block.coinbase || block.coinbaseTX) {
            txs.push(block.coinbaseTX || block.coinbaseTx || block.coinbase);
        }
        if (Array.isArray(block.transactions) && block.transactions.length) {
            txs.push(...block.transactions);
        } else if (Array.isArray(block.txs) && block.txs.length) {
            txs.push(...block.txs);
        }

        for (const tx of txs) {
            if (!tx || !tx.txPublicKey && !tx.tx_public_key && !tx.txPublicKey) {
                // skip malformed tx
                continue;
            }

            const txPubKey = tx.txPublicKey || tx.tx_public_key || tx.txPubKey || tx.txPublicKey;

            let derivation;
            try {
                derivation = await generateKeyDerivation(txPubKey, PRIVATE_VIEW_KEY, config);
            } catch (err) {
                // skip this tx on error
                continue;
            }

            const outputs = Array.isArray(tx.outputs) ? tx.outputs : (Array.isArray(tx.outs) ? tx.outs : []);
            for (let i = 0; i < outputs.length; i++) {
                const output = outputs[i];
                if (!output || (typeof output.key !== "string" && typeof output.out_key !== "string")) continue;
                const outputKey = output.key || output.out_key;

                let recovered;
                try {
                    recovered = await underivePublicKey(derivation, i, outputKey, config);
                } catch (err) {
                    // try next output
                    continue;
                }

                // Normalize strings for comparison
                if (typeof recovered === "string" && typeof PUBLIC_SPEND_KEY === "string" &&
                    recovered.toLowerCase() === PUBLIC_SPEND_KEY.toLowerCase()) {

                    const unlockTime = tx.unlockTime || tx.unlock_time || 0;
                    const unlockedNow = isInputUnlocked(unlockTime, blockHeight);

                    const amount = Number(output.amount || output.value || 0) || 0;
                    if (unlockedNow) unlocked += amount;
                    else locked += amount;
                }
            }
        }
    }

    return [unlocked, locked];
}

module.exports = { calculateOnChainBalance };