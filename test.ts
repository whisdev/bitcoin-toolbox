import * as Bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import axios from "axios";
import {
    testVersion,
    OPENAPI_UNISAT_URL,
    OPENAPI_UNISAT_TOKEN,
    SIGNATURE_SIZE,
    SERVICE_FEE_PERCENT,
    ADMIN_PAYMENT_ADDRESS,
} from "./config/config";
import { WalletTypes } from "./config/config";
import { IUtxo } from "./types/types";

Bitcoin.initEccLib(ecc);
const network = testVersion
    ? Bitcoin.networks.testnet
    : Bitcoin.networks.bitcoin;

// Get Inscription UTXO
const getInscriptionWithUtxo = async (inscriptionId: string) => {
    try {
        // const url = `https://open-api-testnet.unisat.io/v1/indexer/inscription/info/${inscriptionId}`;
        const url = `https://open-api.unisat.io/v1/indexer/inscription/info/${inscriptionId}`;

        const config = {
            headers: {
                Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
            },
        };

        console.log('config :>> ', config);
        console.log('url :>> ', url);

        const res = await axios.get(url, config);

        if (res.data.code === -1) throw "Invalid inscription id";

        return {
            address: res.data.data.address,
            contentType: res.data.data.contentType,
            inscriptionId: inscriptionId,
            inscriptionNumber: res.data.data.inscriptionNumber,
            txid: res.data.data.utxo.txid,
            value: res.data.data.utxo.satoshi,
            vout: res.data.data.utxo.vout,
            scriptpubkey: res.data.data.utxo.scriptPk,
        };
    } catch (error) {
        console.log(
            `Ordinal api is not working now, please try again later Or invalid inscription id ${inscriptionId}`
        );
        throw "Invalid inscription id";
    }
};

// Get BTC UTXO
const getBtcUtxoByAddress = async (address: string) => {
    const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/utxo-data`;

    const config = {
        headers: {
            Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
        },
    };

    let cursor = 0;
    const size = 5000;
    const utxos: IUtxo[] = [];

    while (1) {
        const res = await axios.get(url, { ...config, params: { cursor, size } });

        if (res.data.code === -1) throw "Invalid Address";

        utxos.push(
            ...(res.data.data.utxo as any[]).map((utxo) => {
                return {
                    scriptpubkey: utxo.scriptPk,
                    txid: utxo.txid,
                    value: utxo.satoshi,
                    vout: utxo.vout,
                };
            })
        );

        cursor += res.data.data.utxo.length;

        if (cursor === res.data.data.total) break;
    }

    return utxos;
};

// Get Current Network Fee
const getFeeRate = async () => {
    try {
        const url = `https://mempool.space/${testVersion ? "testnet/" : ""
            }api/v1/fees/recommended`;

        const res = await axios.get(url);

        return res.data.fastestFee;
    } catch (error) {
        console.log("Ordinal api is not working now. Try again later");
        return -1;
    }
};

// Calc Tx Fee
const calculateTxFee = (psbt: Bitcoin.Psbt, feeRate: number) => {
    const tx = new Bitcoin.Transaction();

    for (let i = 0; i < psbt.txInputs.length; i++) {
        const txInput = psbt.txInputs[i];
        tx.addInput(txInput.hash, txInput.index, txInput.sequence);
        tx.setWitness(i, [Buffer.alloc(SIGNATURE_SIZE)]);
    }

    for (let txOutput of psbt.txOutputs) {
        tx.addOutput(txOutput.script, txOutput.value);
    }
    tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);
    tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);

    return tx.virtualSize() * feeRate;
};

const getTxHexById = async (txId: string) => {
    try {
        const { data } = await axios.get(
            `https://mempool.space/${testVersion ? "testnet/" : ""}api/tx/${txId}/hex`
        );

        return data as string;
    } catch (error) {
        console.log("Mempool api error. Can not get transaction hex");

        throw "Mempool api is not working now. Try again later";
    }
};

// Generate Send Ordinal PSBT
export const generateSendOrdinalPSBT = async (
) => {
    try {

        // const inscriptionId = "981366";
        const inscriptionId = "ca7a1140dc226f860d4277fd4ea3f0699a6aebd22a8219880357843abbca650ci0";

        const sellerInscriptionsWithUtxo = await getInscriptionWithUtxo(
            inscriptionId
        );

        console.log('sellerInscriptionsWithUtxo :>> ', sellerInscriptionsWithUtxo);

        // const sellerScriptpubkey = Buffer.from(
        //     sellerInscriptionsWithUtxo.scriptpubkey,
        //     "hex"
        // );
        // const psbt = new Bitcoin.Psbt({ network: network });

        // // Add Inscription Input
        // psbt.addInput({
        //     hash: sellerInscriptionsWithUtxo.txid,
        //     index: sellerInscriptionsWithUtxo.vout,
        //     witnessUtxo: {
        //         value: sellerInscriptionsWithUtxo.value,
        //         script: sellerScriptpubkey,
        //     },
        //     tapInternalKey: Buffer.from(sellerOrdinalPubkey, "hex").slice(1, 33),
        // });

        // // Add Inscription Output to buyer's address
        // psbt.addOutput({
        //     address: buyerOrdinalAddress,
        //     value: sellerInscriptionsWithUtxo.value,
        // });

        // let paymentAddress;

        // paymentAddress = buyerOrdinalAddress;

        // const btcUtxos = await getBtcUtxoByAddress(paymentAddress as string);
        // const feeRate = await getFeeRate();

        // let amount = 0;

        // const buyerPaymentsignIndexes: number[] = [];

        // for (const utxo of btcUtxos) {
        //     const fee = calculateTxFee(psbt, feeRate);

        //     if (amount < fee && utxo.value > 10000) {
        //         amount += utxo.value;

        //         buyerPaymentsignIndexes.push(psbt.inputCount);

        //         psbt.addInput({
        //             hash: utxo.txid,
        //             index: utxo.vout,
        //             witnessUtxo: {
        //                 value: utxo.value,
        //                 script: Buffer.from(utxo.scriptpubkey as string, "hex"),
        //             },
        //             tapInternalKey: Buffer.from(buyerOrdinalPubkey, "hex").slice(1, 33),
        //             sighashType: Bitcoin.Transaction.SIGHASH_ALL,
        //         });
        //     }
        // }

        // const fee = calculateTxFee(psbt, feeRate);

        // if (amount < fee)
        //     throw "You do not have enough bitcoin in your wallet";

        // psbt.addOutput({
        //     address: paymentAddress as string,
        //     value: amount - fee,
        // });

        // return {
        //     psbt: psbt,
        //     buyerPaymentsignIndexes,
        // }


    } catch (error) {

    }
}

generateSendOrdinalPSBT();