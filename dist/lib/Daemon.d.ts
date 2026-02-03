/// <reference types="node" />
import { EventEmitter } from 'events';
import { Block as UtilsBlock, Transaction as UtilsTransaction } from 'turtlecoin-utils';
import { IConfig } from './Config';
import { WalletError } from './WalletError';
import { Block, TopBlock, DaemonConnection } from './Types';

export declare interface Daemon {
    /**
     * Emesso quando l'interfaccia non riesce a contattare il daemon sottostante.
     * Verrà emesso solo alla prima disconnessione (non ad ogni pacchetto fallito).
     */
    on(event: 'disconnect', callback: (error: Error) => void): this;

    /**
     * Emesso quando l'interfaccia ha precedentemente perso la connessione e ora si è riconnessa.
     * Verrà emesso solo alla prima riconnessione.
     */
    on(event: 'connect', callback: () => void): this;

    /**
     * Emesso quando cambia l'altezza locale o di rete.
     */
    on(event: 'heightchange', callback: (localDaemonBlockCount: number, networkDaemonBlockCount: number) => void): this;

    /**
     * Emesso ad ogni blocco grezzo scaricato dal daemon (oggetto Utils Block).
     */
    on(event: 'rawblock', callback: (block: UtilsBlock) => void): this;

    /**
     * Emesso ad ogni transazione grezza scaricata dal daemon (oggetto Utils Transaction).
     */
    on(event: 'rawtransaction', callback: (transaction: UtilsTransaction) => void): this;
}

/**
 * @noInheritDoc
 */
export declare class Daemon extends EventEmitter {
    /**
     * Host dell'API/daemon
     */
    private readonly host: string;

    /**
     * Porta dell'API/daemon
     */
    private readonly port: number;

    /**
     * Usare HTTPS?
     */
    private ssl: boolean;

    /**
     * SSL determinato (true/false) oppure ancora da determinare
     */
    private sslDetermined: boolean;

    /**
     * Se si sta parlando con un cache API (blockchain cache) o con un daemon convenzionale
     */
    private isCacheApi: boolean;

    /**
     * Indica se è stato determinato il tipo di API (cache o convenzionale)
     */
    private isCacheApiDetermined: boolean;

    /**
     * Indirizzo per eventuali fee
     */
    private feeAddress: string;

    /**
     * Importo fee in unità atomiche
     */
    private feeAmount: number;

    /**
     * Altezza blocchi del daemon locale
     */
    private localDaemonBlockCount: number;

    /**
     * Altezza blocchi di rete
     */
    private networkBlockCount: number;

    /**
     * Numero di peer (incoming + outgoing)
     */
    private peerCount: number;

    /**
     * Hashrate noto dell'ultimo blocco
     */
    private lastKnownHashrate: number;

    /**
     * Numero di blocchi da scaricare per richiesta
     */
    private blockCount: number;

    private config: IConfig;
    private httpAgent: any;
    private httpsAgent: any;

    /**
     * Data/ora ultimo update altezza di rete
     */
    private lastUpdatedNetworkHeight: Date;

    /**
     * Data/ora ultimo update altezza locale
     */
    private lastUpdatedLocalHeight: Date;

    /**
     * Stato connessione (true se connesso)
     */
    private connected: boolean;

    /**
     * Usare getrawblocks invece di getwalletsyncdata (toggle runtime)
     */
    private useRawBlocks: boolean;

    /**
     * @param host Host o IP del daemon
     * @param port Porta del daemon (es. 18511 per Kryptokrona)
     * @param isCacheApi Opzionale: true se è un blockchain cache API
     * @param ssl Opzionale: forzare SSL true/false
     */
    constructor(host: string, port: number, isCacheApi?: boolean, ssl?: boolean);

    updateConfig(config: IConfig): void;

    getNetworkBlockCount(): number;
    getLocalDaemonBlockCount(): number;

    init(): Promise<void>;
    updateDaemonInfo(): Promise<void>;

    nodeFee(): [string, number];

    /**
     * Restituisce cambi al pool (parsed) o false in caso di errore / assenza.
     * Il tipo ritorno è generico perché il formato può essere un oggetto complesso.
     */
    getPoolChanges(knownTxs: string[]): Promise<any | false>;

    /**
     * Ottiene i blocchi per la sincronizzazione wallet.
     * Ritorna una Promise che risolve in una tupla:
     *  - primo elemento: array di Block (dei tipi definiti in Types)
     *  - secondo elemento: TopBlock (oggetto con height/hash) oppure boolean (true quando non è disponibile un TopBlock completo)
     *
     * Nota: in caso di errore di fetch la funzione torna [[], false] come dal comportamento attuale.
     */
    getWalletSyncData(blockHashCheckpoints: string[], startHeight: number, startTimestamp: number): Promise<[Block[], TopBlock | boolean]>;

    /**
     * Mappa gli indici globali per l'intervallo richiesto.
     */
    getGlobalIndexesForRange(startHeight: number, endHeight: number): Promise<Map<string, number[]>>;

    getCancelledTransactions(transactionHashes: string[]): Promise<string[]>;

    getRandomOutputsByAmount(amounts: number[], requestedOuts: number): Promise<[number, [number, string][]][]>;

    /**
     * Invia una transazione raw.
     * Ritorna una tupla: [success: boolean, error?: string | WalletError]
     */
    sendTransaction(rawTransaction: string): Promise<[boolean, string | WalletError | undefined]>;

    getConnectionInfo(): DaemonConnection;
    getConnectionString(): string;

    /**
     * Metodo privato: converte raw blocks nel modello Block interno.
     */
    private rawBlocksToBlocks(rawBlocks: any[]): Promise<Block[]>;

    /**
     * Metodo privato: aggiorna fee info
     */
    private updateFeeInfo(): Promise<void>;

    private makeGetRequest(endpoint: string): Promise<any>;
    private makePostRequest(endpoint: string, body?: any): Promise<any>;

    /**
     * Metodo privato: esegue la richiesta HTTP al daemon e ritorna shape compatibile (body, status).
     * Ritorna una tupla [body, statusCode].
     */
    private makeRequest(endpoint: string, method: 'get' | 'post', body?: any): Promise<[any, number]>;
}