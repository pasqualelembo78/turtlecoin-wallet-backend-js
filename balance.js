"use strict";

const axios = require("axios");
const {
  generateKeyDerivation,
  underivePublicKey
} = require("./dist/lib/CryptoWrapper");

const { isInputUnlocked } = require("./dist/lib/Utilities");
const { Config } = require("./dist/lib/Config");

/* ================= CONFIG ================= */

// Endpoint del wallet daemon Mevacoin
const DAEMON_URL = "http://82.165.218.56:17081/getwalletsyncdata";

// Chiavi del wallet
const PRIVATE_VIEW_KEY = "6c30a2f81e219334db8c283707be3e0f2846d5302400b2062af9f4ab439dfa0b";
const PUBLIC_SPEND_KEY = "c1d77623c45355d64fd4334804d63725cafe0e388f216d33fa2707f3ba1f5cb2";

const config = new Config();

/* ========================================== */

async function main() {
  try {
    console.log("Recupero blocchi dal daemon...");

    const response = await axios.post(DAEMON_URL, {
      blockCount: 100,           // numero di blocchi da leggere per volta
      blockHashCheckpoints: [],
      skipCoinbaseTransactions: false,
      startHeight: 0,
      startTimestamp: 0
    });

    let unlocked = 0;
    let locked = 0;

    for (const block of response.data.items) {
      const txs = [];

      if (block.coinbaseTX) txs.push(block.coinbaseTX);
      if (block.transactions) txs.push(...block.transactions);

      for (const tx of txs) {
        // Derivazione chiave per questa transazione
        const derivation = await generateKeyDerivation(
          tx.txPublicKey,
          PRIVATE_VIEW_KEY,
          config
        );

        for (let i = 0; i < tx.outputs.length; i++) {
          const output = tx.outputs[i];

          // Recupero la Public Spend Key derivata dall'output
          const recoveredPubSpend = await underivePublicKey(
            derivation,
            i,
            output.key,
            config
          );

          // Confronto con la Public Spend Key del wallet
          if (recoveredPubSpend === PUBLIC_SPEND_KEY) {
            const unlockedNow = isInputUnlocked(
              tx.unlockTime,
              block.blockHeight
            );

            if (unlockedNow) unlocked += output.amount;
            else locked += output.amount;

            console.log("MATCH", {
              height: block.blockHeight,
              amount: output.amount,
              unlockTime: tx.unlockTime,
              unlocked: unlockedNow
            });
          }
        }
      }
    }

    console.log("\n====== RISULTATO ======");
    console.log("Unlocked balance:", unlocked);
    console.log("Locked balance:", locked);

  } catch (err) {
    console.error("Errore durante il calcolo del bilancio:", err);
  }
}

main();
