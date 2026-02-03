"use strict";
// Merged and adapted Daemon.js for Kryptokrona endpoints with Tonchan-compatible return shape.
// Sources: original Tonchan Daemon.js and Kryptokrona Daemon_old.js.

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Daemon = void 0;
const _ = require("lodash");
const axios_1 = require("axios");
const events_1 = require("events");
const kryptokrona_utils_1 = require("kryptokrona-utils");
const http = require("http");
const https = require("https");
const Assert_1 = require("./Assert");
const Config_1 = require("./Config");
const ValidateParameters_1 = require("./ValidateParameters");
const Logger_1 = require("./Logger");
const WalletError_1 = require("./WalletError");
const Types_1 = require("./Types");
/**
 * @noInheritDoc
 */
class Daemon extends events_1.EventEmitter {
    /**
     * @param host The host to access the API on. Can be an IP, or a URL, for
     *             example, 1.1.1.1, or blockapi.turtlepay.io
     *
     * @param port The port to access the API on. Normally 18511 for a TurtleCoin
     *             daemon, 80 for a HTTP api, or 443 for a HTTPS api.
     *
     * @param isCacheApi You can optionally specify whether this API is a
     *                   blockchain cache API to save a couple of requests.
     *                   If you're not sure, do not specify this parameter -
     *                   we will work it out automatically.
     *
     * @param ssl        You can optionally specify whether this API supports
     *                   ssl/tls/https to save a couple of requests.
     *                   If you're not sure, do not specify this parameter -
     *                   we will work it out automatically.
     */
    constructor(host, port, isCacheApi, ssl) {
        super();
        /**
         * Whether we should use https for our requests
         */
        this.ssl = true;
        /**
         * Have we determined if we should be using ssl or not?
         */
        this.sslDetermined = false;
        /**
         * Whether we're talking to a conventional daemon, or a blockchain cache API
         */
        this.isCacheApi = false;
        /**
         * Have we determined if this is a cache API or not?
         */
        this.isCacheApiDetermined = false;
        /**
         * The address node fees will go to
         */
        this.feeAddress = '';
        /**
         * The amount of the node fee in atomic units
         */
        this.feeAmount = 0;
        /**
         * The amount of blocks the daemon we're connected to has
         */
        this.localDaemonBlockCount = 0;
        /**
         * The amount of blocks the network has
         */
        this.networkBlockCount = 0;
        /**
         * The amount of peers we have, incoming+outgoing
         */
        this.peerCount = 0;
        /**
         * The hashrate of the last known local block
         */
        this.lastKnownHashrate = 0;
        /**
         * The number of blocks to download per /getwalletsyncdata request
         */
        this.blockCount = 100;
        /**
         * Should we use /getrawblocks instead of /getwalletsyncdata
         */
        this.useRawBlocks = false;
        this.config = new Config_1.Config();
        this.httpAgent = new http.Agent({
            keepAlive: true,
            keepAliveMsecs: 20000,
            maxSockets: Infinity,
        });
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 20000,
            maxSockets: Infinity,
        });
        /**
         * Last time the network height updated. If this goes over the configured
         * limit, we'll emit deadnode.
         */
        this.lastUpdatedNetworkHeight = new Date();
        /**
         * Last time the daemon height updated. If this goes over the configured
         * limit, we'll emit deadnode.
         */
        this.lastUpdatedLocalHeight = new Date();
        /**
         * Did our last contact with the daemon succeed. Set to true initially
         * so initial failure to connect will fire disconnect event.
         */
        this.connected = true; // allineato a Kryptokrona
        this.setMaxListeners(0);
        (0, Assert_1.assertString)(host, 'host');
        (0, Assert_1.assertNumber)(port, 'port');
        (0, Assert_1.assertBooleanOrUndefined)(isCacheApi, 'isCacheApi');
        (0, Assert_1.assertBooleanOrUndefined)(ssl, 'ssl');
        this.host = host;
        this.port = port;
        /* Raw IP's very rarely support SSL. This fixes the warning from
           https://github.com/nodejs/node/pull/23329 */
        if (/^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(this.host) && ssl === undefined) {
            ssl = false;
        }
        if (isCacheApi !== undefined) {
            this.isCacheApi = isCacheApi;
            this.isCacheApiDetermined = true;
        }
        if (ssl !== undefined) {
            this.ssl = ssl;
            this.sslDetermined = true;
        }
    }
    updateConfig(config) {
        this.config = (0, Config_1.MergeConfig)(config);
        this.blockCount = this.config.blocksPerDaemonRequest;
    }
    /**
     * Get the amount of blocks the network has
     */
    getNetworkBlockCount() {
        return this.networkBlockCount;
    }
    /**
     * Get the amount of blocks the daemon we're connected to has
     */
    getLocalDaemonBlockCount() {
        return this.localDaemonBlockCount;
    }
    /**
     * Initialize the daemon and the fee info
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            /* Note - if one promise throws, the other will be cancelled */
            yield Promise.all([this.updateDaemonInfo(), this.updateFeeInfo()]);
            if (this.networkBlockCount === 0) {
                this.emit('deadnode');
            }
        });
    }
    /**
     * Update the daemon info
     */
    updateDaemonInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            let info;
            const haveDeterminedSsl = this.sslDetermined;
            try {
                const [body, status] = yield this.makeGetRequest('/info');
                info = body || {};
            }
            catch (err) {
                Logger_1.logger.log('Failed to update daemon info: ' + (err && err.toString ? err.toString() : String(err)), Logger_1.LogLevel.INFO, [Logger_1.LogCategory.DAEMON]);
                const diff1 = (new Date().getTime() - this.lastUpdatedNetworkHeight.getTime()) / 1000;
                const diff2 = (new Date().getTime() - this.lastUpdatedLocalHeight.getTime()) / 1000;
                if (diff1 > this.config.maxLastUpdatedNetworkHeightInterval
                    || diff2 > this.config.maxLastUpdatedLocalHeightInterval) {
                    this.emit('deadnode');
                }
                return;
            }
            /* Possibly determined daemon type was HTTPS, got a valid response,
               but not valid data. Manually set to http and try again. */
            if (info.height === undefined && !haveDeterminedSsl) {
                this.sslDetermined = true;
                this.ssl = false;
                const diff1 = (new Date().getTime() - this.lastUpdatedNetworkHeight.getTime()) / 1000;
                const diff2 = (new Date().getTime() - this.lastUpdatedLocalHeight.getTime()) / 1000;
                if (diff1 > this.config.maxLastUpdatedNetworkHeightInterval
                    || diff2 > this.config.maxLastUpdatedLocalHeightInterval) {
                    this.emit('deadnode');
                }
                return this.updateDaemonInfo();
            }
            /* Are we talking to a cache API or not? */
            if (!this.isCacheApiDetermined) {
                if (info.isCacheApi !== undefined && _.isBoolean(info.isCacheApi)) {
                    this.isCacheApi = info.isCacheApi;
                    this.isCacheApiDetermined = true;
                }
                else {
                    this.isCacheApi = false;
                    this.isCacheApiDetermined = true;
                }
            }
            /* Height returned may be network_height that is height+1 in some implementations.
               Decrement only if it's a number and non-zero. */
            if (typeof info.network_height === 'number' && info.network_height !== 0) {
                info.network_height = info.network_height - 1;
            }
            if (this.localDaemonBlockCount !== info.height
                || this.networkBlockCount !== info.network_height) {
                this.emit('heightchange', info.height, info.network_height);
                this.lastUpdatedNetworkHeight = new Date();
                this.lastUpdatedLocalHeight = new Date();
            }
            else {
                const diff1 = (new Date().getTime() - this.lastUpdatedNetworkHeight.getTime()) / 1000;
                const diff2 = (new Date().getTime() - this.lastUpdatedLocalHeight.getTime()) / 1000;
                if (diff1 > this.config.maxLastUpdatedNetworkHeightInterval
                    || diff2 > this.config.maxLastUpdatedLocalHeightInterval) {
                    this.emit('deadnode');
                }
            }
            this.localDaemonBlockCount = info.height;
            this.networkBlockCount = info.network_height;
            this.peerCount = (info.incoming_connections_count || 0) + (info.outgoing_connections_count || 0);
            if (typeof info.difficulty === 'number' && this.config && this.config.blockTargetTime) {
                this.lastKnownHashrate = info.difficulty / this.config.blockTargetTime;
            }
        });
    }
    /**
     * Get the node fee and address
     */
    nodeFee() {
        return [this.feeAddress, this.feeAmount];
    }
    getPoolChanges(knownTxs) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoint = "/get_pool_changes_lite";
            let data;
            try {
                const [body, status] = yield this.makePostRequest(endpoint, {
                    knownTxsIds: knownTxs,
                });
                data = body || {};
                Logger_1.logger.log(`Making pool changes request, got data ${JSON.stringify(data)}`, Logger_1.LogLevel.DEBUG, [Logger_1.LogCategory.DAEMON]);
                // JSON.stringify then regex replace for Node compatibility
                let json = JSON.stringify(data);
                json = json.replace(/transactionPrefixInfo\.txPrefix/g, 'transactionPrefixInfo')
                    .replace(/transactionPrefixInfo\.txHash/g, 'transactionPrefixInfotxHash');
                const parsed = JSON.parse(json);
                if (!parsed || !Array.isArray(parsed.addedTxs) || parsed.addedTxs.length === 0)
                    return false;
                return parsed;
            }
            catch (err) {
                return false;
            }
        });
    }
    /**
     * @param blockHashCheckpoints  Hashes of the last known blocks. Later
     *                              blocks (higher block height) should be
     *                              ordered at the front of the array.
     *
     * @param startHeight           Height to start taking blocks from
     * @param startTimestamp        Block timestamp to start taking blocks from
     *
     * Gets blocks from the daemon. Blocks are returned starting from the last
     * known block hash (if higher than the startHeight/startTimestamp)
     */
    getWalletSyncData(blockHashCheckpoints, startHeight, startTimestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoint = this.useRawBlocks ? '/getrawblocks' : '/getwalletsyncdata';
            let data;
            try {
                const [body, status] = yield this.makePostRequest(endpoint, {
                    blockCount: this.blockCount,
                    blockHashCheckpoints,
                    skipCoinbaseTransactions: !this.config.scanCoinbaseTransactions,
                    startHeight,
                    startTimestamp,
                });
                data = body || {};
            }
            catch (err) {
                this.blockCount = Math.max(1, Math.floor(this.blockCount / 2));
                if (err && err.statusCode === 404 && this.useRawBlocks) {
                    Logger_1.logger.log(`Daemon does not support /getrawblocks, falling back to /getwalletsyncdata`, Logger_1.LogLevel.DEBUG, [Logger_1.LogCategory.DAEMON]);
                    this.useRawBlocks = false;
                    return this.getWalletSyncData(blockHashCheckpoints, startHeight, startTimestamp);
                }
                Logger_1.logger.log(`getWalletSyncData failed: ${err && err.toString ? err.toString() : String(err)}, lowering blockCount to ${this.blockCount}`, Logger_1.LogLevel.INFO, [Logger_1.LogCategory.DAEMON]);
                return [[], false];
            }
            const itemsRaw = Array.isArray(data.items) ? data.items : [];
            if (itemsRaw.length > 0) {
                Logger_1.logger.log(`Fetched ${itemsRaw.length} blocks from daemon`, Logger_1.LogLevel.DEBUG, [Logger_1.LogCategory.DAEMON]);
                if (this.blockCount < this.config.blocksPerDaemonRequest) {
                    this.blockCount = Math.min(this.config.blocksPerDaemonRequest, this.blockCount * 2);
                }
                this.lastUpdatedNetworkHeight = new Date();
                this.lastUpdatedLocalHeight = new Date();
            }
            // NORMALIZZAZIONE: accetta sia nomi Kryptokrona che Tonchan
            const normalizedItems = itemsRaw.map((it) => {
                const height = (typeof it.height === 'number') ? it.height
                    : (typeof it.blockHeight === 'number' ? it.blockHeight
                        : (typeof it.block_height === 'number' ? it.block_height : undefined));
                const hash = it.hash || it.blockHash || it.block_hash || '';
                const timestamp = (typeof it.timestamp === 'number') ? it.timestamp
                    : (typeof it.blockTimestamp === 'number' ? it.blockTimestamp
                        : (typeof it.block_timestamp === 'number' ? it.block_timestamp : undefined));
                const coinbaseTransaction = it.coinbaseTransaction || it.coinbaseTX || it.coinbase_tx || null;
                const transactions = Array.isArray(it.transactions) ? it.transactions : (Array.isArray(it.txs) ? it.txs : []);
                return {
                    height,
                    hash,
                    timestamp,
                    coinbaseTransaction,
                    transactions,
                    __orig: it
                };
            });
            // Conversione in oggetti Block attesi dal wallet
            let blocks;
            if (this.useRawBlocks) {
                // rawBlocksToBlocks si aspetta il formato raw di Kryptokrona
                blocks = yield this.rawBlocksToBlocks(itemsRaw);
            }
            else {
                // Block.fromJSON si aspetta campi height/hash/timestamp/coinbaseTransaction/transactions
                blocks = normalizedItems.map((ni) => {
                    const clone = {
                        height: ni.height,
                        hash: ni.hash,
                        timestamp: ni.timestamp,
                        coinbaseTransaction: ni.coinbaseTransaction,
                        transactions: ni.transactions
                    };
                    return Types_1.Block.fromJSON(clone);
                });
            }
            // TOPBLOCK: se il daemon lo fornisce usalo; altrimenti costruiscilo da ultimo blocco o networkBlockCount
            let topBlock = false;
            if (data.topBlock && typeof data.topBlock.height === 'number' && data.topBlock.hash) {
                topBlock = {
                    height: data.topBlock.height,
                    hash: data.topBlock.hash
                };
            }
            else if (blocks && blocks.length > 0) {
                const last = blocks[blocks.length - 1];
                if (last && typeof last.height === 'number') {
                    topBlock = { height: last.height, hash: last.hash || '' };
                }
                else if (typeof this.networkBlockCount === 'number' && this.networkBlockCount > 0) {
                    topBlock = { height: this.networkBlockCount, hash: '' };
                }
            }
            else if (typeof this.networkBlockCount === 'number' && this.networkBlockCount > 0) {
                topBlock = { height: this.networkBlockCount, hash: '' };
            }
            // Ritorna sempre la tupla: [blocksArray, topBlock|true]
            return [blocks, topBlock || true];
        });
    }
    /**
     * @returns Returns a mapping of transaction hashes to global indexes
     *
     * Get global indexes for the transactions in the range
     * [startHeight, endHeight]
     */
    getGlobalIndexesForRange(startHeight, endHeight) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isCacheApi) {
                throw new Error('This call is not supported on the cache api. The cache API returns global indexes directly from /getWalletSyncData');
            }
            try {
                const [body, status] = yield this.makePostRequest('/get_global_indexes_for_range', {
                    endHeight,
                    startHeight,
                });
                const data = body || {};
                const indexes = new Map();
                for (const index of data.indexes || []) {
                    indexes.set(index.key, index.value);
                }
                return indexes;
            }
            catch (err) {
                Logger_1.logger.log('Failed to get global indexes: ' + (err && err.toString ? err.toString() : String(err)), Logger_1.LogLevel.ERROR, Logger_1.LogCategory.DAEMON);
                return new Map();
            }
        });
    }
    getCancelledTransactions(transactionHashes) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [body, status] = yield this.makePostRequest('/get_transactions_status', {
                    transactionHashes,
                });
                const data = body || {};
                return data.transactionsUnknown || [];
            }
            catch (err) {
                Logger_1.logger.log('Failed to get transactions status: ' + (err && err.toString ? err.toString() : String(err)), Logger_1.LogLevel.ERROR, Logger_1.LogCategory.DAEMON);
                return [];
            }
        });
    }
    /**
     * Gets random outputs for the given amounts. requestedOuts per. Usually mixin+1.
     *
     * @returns Returns an array of amounts to global indexes and keys. There
     *          should be requestedOuts indexes if the daemon fully fulfilled
     *          our request.
     */
    getRandomOutputsByAmount(amounts, requestedOuts) {
        return __awaiter(this, void 0, void 0, function* () {
            let data;
            try {
                if (this.isCacheApi) {
                    const [body, status] = yield this.makePostRequest('/randomOutputs', {
                        amounts: amounts,
                        mixin: requestedOuts,
                    });
                    data = body || {};
                }
                else {
                    const [tmp, status] = yield this.makePostRequest('/getrandom_outs', {
                        amounts: amounts,
                        outs_count: requestedOuts,
                    });
                    data = tmp.outs || [];
                }
            }
            catch (err) {
                Logger_1.logger.log('Failed to get random outs: ' + (err && err.toString ? err.toString() : String(err)), Logger_1.LogLevel.ERROR, [Logger_1.LogCategory.TRANSACTIONS, Logger_1.LogCategory.DAEMON]);
                return [];
            }
            const outputs = [];
            for (const output of data) {
                const indexes = [];
                for (const outs of output.outs) {
                    indexes.push([outs.global_amount_index, outs.out_key]);
                }
                outputs.push([output.amount, _.sortBy(indexes, ([index]) => index)]);
            }
            return outputs;
        });
    }
    sendTransaction(rawTransaction) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [result, statusCode] = yield this.makePostRequest('/sendrawtransaction', {
                    tx_as_hex: rawTransaction,
                });
                if (result && result.status && typeof result.status === 'string' && result.status.toUpperCase() === 'OK') {
                    return [true, undefined];
                }
                if (!result || !result.status || !result.error) {
                    return [false, undefined];
                }
                return [false, result.error];
            }
            catch (err) {
                Logger_1.logger.log('Failed to send transaction: ' + (err && err.toString ? err.toString() : String(err)), Logger_1.LogLevel.ERROR, [Logger_1.LogCategory.TRANSACTIONS, Logger_1.LogCategory.DAEMON]);
                return [false, new WalletError_1.WalletError(WalletError_1.WalletErrorCode.DAEMON_ERROR, err && err.toString ? err.toString() : String(err))];
            }
        });
    }
    getConnectionInfo() {
        return {
            daemonType: this.isCacheApi ? Types_1.DaemonType.BlockchainCacheApi : Types_1.DaemonType.ConventionalDaemon,
            daemonTypeDetermined: this.isCacheApiDetermined,
            host: this.host,
            port: this.port,
            ssl: this.ssl,
            sslDetermined: this.sslDetermined,
        };
    }
    getConnectionString() {
        return this.host + ':' + this.port;
    }
    rawBlocksToBlocks(rawBlocks) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = [];

        for (const rawBlock of rawBlocks) {
            const block = yield kryptokrona_utils_1.Block.from(rawBlock.block, this.config);

            this.emit('rawblock', block);
            this.emit('rawtransaction', block.minerTransaction);

            let coinbaseTransaction;

            if (this.config.scanCoinbaseTransactions) {
                const keyOutputs = [];

                for (const output of block.minerTransaction.outputs) {
                    if (output.type === kryptokrona_utils_1.TransactionOutputs.OutputType.KEY) {
                        keyOutputs.push(
                            new Types_1.KeyOutput(
                                output.key,
                                output.amount.toJSNumber()
                            )
                        );
                    }
                }

                coinbaseTransaction = new Types_1.RawCoinbaseTransaction(
                    keyOutputs,
                    yield block.minerTransaction.hash(),
                    block.minerTransaction.publicKey,
                    block.minerTransaction.unlockTime > Number.MAX_SAFE_INTEGER
                        ? block.minerTransaction.unlockTime.toJSNumber()
                        : block.minerTransaction.unlockTime,
                    Math.floor(block.timestamp.getTime() / 1000)
                );
            }

            const transactions = [];

            for (const tx of rawBlock.transactions) {
                const rawTX = yield kryptokrona_utils_1.Transaction.from(tx);

                this.emit('rawtransaction', tx);

                const keyOutputs = [];
                const keyInputs = [];

                for (const output of rawTX.outputs) {
                    if (output.type === kryptokrona_utils_1.TransactionOutputs.OutputType.KEY) {
                        keyOutputs.push(
                            new Types_1.KeyOutput(
                                output.key,
                                output.amount.toJSNumber()
                            )
                        );
                    }
                }

                for (const input of rawTX.inputs) {
                    if (input.type === kryptokrona_utils_1.TransactionInputs.InputType.KEY) {
                        keyInputs.push(
                            new Types_1.KeyInput(
                                input.amount.toJSNumber(),
                                input.keyImage,
                                input.keyOffsets.map(x => x.toJSNumber())
                            )
                        );
                    }
                }

                transactions.push(
                    new Types_1.RawTransaction(
                        keyOutputs,
                        yield rawTX.hash(),
                        rawTX.publicKey,
                        rawTX.unlockTime > Number.MAX_SAFE_INTEGER
                            ? rawTX.unlockTime.toJSNumber()
                            : rawTX.unlockTime,
                        rawTX.paymentId || '',
                        keyInputs,
                        Math.floor(block.timestamp.getTime() / 1000)
                    )
                );
            }

            // 🔴 QUESTO MANCAVA
            result.push(
                new Types_1.Block(
                    transactions,
                    block.height,
                    yield block.hash(),
                    Math.floor(block.timestamp.getTime() / 1000),
                    coinbaseTransaction
                )
            );
        }

        return result;
    });
}



    /**
     * Update the fee address and amount
     */
    updateFeeInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            let feeInfo;
            try {
                const [body, status] = yield this.makeGetRequest('/fee');
                feeInfo = body || {};
            }
            catch (err) {
                Logger_1.logger.log('Failed to update fee info: ' + (err && err.toString ? err.toString() : String(err)), Logger_1.LogLevel.INFO, [Logger_1.LogCategory.DAEMON]);
                return;
            }
            if (!feeInfo || feeInfo.address === '') {
                return;
            }
            const integratedAddressesAllowed = false;
            const err = (yield (0, ValidateParameters_1.validateAddresses)(new Array(feeInfo.address), integratedAddressesAllowed, this.config)).errorCode;
            if (err !== WalletError_1.WalletErrorCode.SUCCESS) {
                Logger_1.logger.log('Failed to validate address from daemon fee info: ' + err.toString(), Logger_1.LogLevel.WARNING, [Logger_1.LogCategory.DAEMON]);
                return;
            }
            if (feeInfo.amount > 0) {
                this.feeAddress = feeInfo.address;
                this.feeAmount = feeInfo.amount;
            }
        });
    }
    makeGetRequest(endpoint) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.makeRequest(endpoint, 'get');
        });
    }
    makePostRequest(endpoint, body) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.makeRequest(endpoint, 'post', body);
        });
    }
    /**
     * Makes a get/post request to the given endpoint and returns [body, status].
     */
    makeRequest(endpoint, method, body) {
        return __awaiter(this, void 0, void 0, function* () {
            const options = {
                method,
                data: body,
                timeout: this.config.requestTimeout,
            };
            try {
                const protocol = this.sslDetermined ? (this.ssl ? 'https' : 'http') : 'https';
                const url = `${protocol}://${this.host}:${this.port}${endpoint}`;
                Logger_1.logger.log(`Making request to ${url} with params ${body ? JSON.stringify(body) : '{}'}`, Logger_1.LogLevel.TRACE, [Logger_1.LogCategory.DAEMON]);
                const response = yield (0, axios_1.default)(Object.assign(Object.assign({}, options), { url, httpsAgent: protocol === 'https' ? this.httpsAgent : undefined, httpAgent: protocol === 'http' ? this.httpAgent : undefined, ...this.config.customRequestOptions }));
                if (!this.sslDetermined) {
                    this.ssl = true;
                    this.sslDetermined = true;
                }
                if (!this.connected) {
                    this.emit('connect');
                    this.connected = true;
                }
                Logger_1.logger.log(`Got response from ${url} with body ${JSON.stringify(response.data)}`, Logger_1.LogLevel.TRACE, [Logger_1.LogCategory.DAEMON]);
                // RETURN shape compatible with Tonchan original: [body, statusCode]
                return [response.data, response.status];
            }
            catch (err) {
                if (this.sslDetermined) {
                    if (this.connected) {
                        this.emit('disconnect', err);
                        this.connected = false;
                    }
                    throw err;
                }
                try {
                    const url = `http://${this.host}:${this.port}${endpoint}`;
                    Logger_1.logger.log(`Making request to ${url} with params ${body ? JSON.stringify(body) : '{}'}`, Logger_1.LogLevel.TRACE, [Logger_1.LogCategory.DAEMON]);
                    const response = yield (0, axios_1.default)(Object.assign(Object.assign({}, options), { url, httpAgent: this.httpAgent, ...this.config.customRequestOptions }));
                    this.ssl = false;
                    this.sslDetermined = true;
                    if (!this.connected) {
                        this.emit('connect');
                        this.connected = true;
                    }
                    Logger_1.logger.log(`Got response from ${url} with body ${JSON.stringify(response.data)}`, Logger_1.LogLevel.TRACE, [Logger_1.LogCategory.DAEMON]);
                    return [response.data, response.status];
                }
                catch (err2) {
                    if (this.connected) {
                        this.emit('disconnect', err2);
                        this.connected = false;
                    }
                    throw err2;
                }
            }
        });
    }
}
exports.Daemon = Daemon;