import type {
  IndexValueHistoryItem,
  Transaction,
  TransactionMap,
} from '../types';
import { filterValidTransactions } from '../utils/filterValidTransactions.js';
import { sortTransactions } from '../utils/sortTransactions.js';
import axios, { AxiosRequestConfig } from 'axios';
/**
 * Given a list of transactions, this creates a list that contains the index value at the
 * time of each transaction, and includes the transaction as well.
 * @see {@link https://github.com/Mimicry-Protocol/TAMI/blob/main/reference/card-ladder-white-paper.pdf}
 */
export function createIndexValueHistory(
  transactionHistory: Transaction[]
): IndexValueHistoryItem[] {
  const transactionMap: TransactionMap = {};

  let lastIndexValue = 0;
  let lastDivisor = 1;

  const result = [];

  console.log("transaction history after filtering: ", transactionHistory.length)

  for (let i = 0; i < transactionHistory.length; i += 1) {
    const transaction = transactionHistory[i];

    const isFirstSale = !transactionMap[transaction.itemId];

    transactionMap[transaction.itemId] = transaction;

    const itemCount = Object.keys(transactionMap).length;

    const allLastSoldValue = Object.values(transactionMap).reduce(
      (acc, { price }) => {
        return acc + price;
      },
      0
    );

    // console.log("allLastSoldValue: ", allLastSoldValue)
    // console.log("tx price", transaction.price)
    const indexValue = allLastSoldValue / (itemCount * lastDivisor);

    if (i === 0) {
      lastIndexValue = indexValue;

      result.push({
        itemId: transaction.itemId,
        price: transaction.price,
        indexValue,
        transaction,
      });

      continue;
    }

    const nextDivisor = isFirstSale
      ? lastDivisor * (indexValue / lastIndexValue)
      : lastDivisor;

    const weightedIndexValue = allLastSoldValue / (itemCount * nextDivisor);

    lastIndexValue = weightedIndexValue;
    lastDivisor = nextDivisor;

    result.push({
      itemId: transaction.itemId,
      price: transaction.price,
      indexValue: weightedIndexValue,
      transaction,
    });
  }

  return result;
}

/**
 * Given a list of IndexValueHistoryItem, returns the index value of the last item.
 */
export function getIndexValue(indexValueHistory: IndexValueHistoryItem[]) {
  return indexValueHistory[indexValueHistory.length - 1].indexValue;
}

/**
 * Given a list of IndexValueHistoryItem, calculates the index ratio for the last transaction
 * of each item in the collection. Returns a list of objects where each object is the IndexValueHistoryItem
 * with an additional `indexRatio` property added.
 */
export function getIndexRatios(indexValueHistory: IndexValueHistoryItem[]) {
  const lastSaleMap = indexValueHistory.reduce<
    Record<Transaction['itemId'], IndexValueHistoryItem>
  >((acc, historyItem) => {
    acc[historyItem.itemId] = historyItem;
    return acc;
  }, {});

  return Object.values(lastSaleMap).map((item) => {
    const indexRatio = item.price / item.indexValue;
    return {
      ...item,
      indexRatio,
    };
  });
}

/**
 * Given a list of transactions for a given collection, this calculates the
 * Time Adjusted Market Index for that collection.
 * @returns TAMI if it's able to be calculated. Otherwise, it returns null.
 */
export function tami(transactionHistory: Transaction[]): number | null {
  const sortedTransactions = sortTransactions(transactionHistory);
  // console.log("sortedTransactions: ", sortedTransactions)
  const validTransactions = filterValidTransactions(sortedTransactions);
  // console.log("validTransactions: ", validTransactions)
  const indexValueHistory = createIndexValueHistory(validTransactions);
  // console.log("index value history:", indexValueHistory)

  if (indexValueHistory.length === 0) {
    return null;
  }

  const indexValue = getIndexValue(indexValueHistory);
  console.log("index value: ", indexValue)
  const indexRatios = getIndexRatios(indexValueHistory);
  const timeAdjustedValues = indexRatios.map((item) => {
    return indexValue * item.indexRatio;
  });
  const timeAdjustedMarketIndex = timeAdjustedValues.reduce(
    (acc, value) => acc + value,
    0
  );
  return timeAdjustedMarketIndex;
}


// continuation_token = ""
let continuation_token: string = ""
let tx_list: Transaction[] = []
while (true) {
  let url: string = "https://api.reservoir.tools/sales/v4?contract=0x5180db8F5c931aaE63c74266b211F580155ecac8"
  // let one_year_ago = Math.floor(Date.now() / 1000) - 60*60*24*365
  // url += "&startTimestamp=" + one_year_ago
  url += "&startTimestamp=0"

  if (continuation_token) {
    url += "&continuation=" + continuation_token
  }
  url += "&limit=1000"
  console.log("url: ", url)
  let config: AxiosRequestConfig = {"headers": {"accept": "*/*", "x-api-key": "demo-api-key"}}
  let response = await axios.get(url, config)

  let sales = response.data["sales"]
  console.log("sales length: ", sales.length)
  continuation_token = response.data["continuation"]

  let price, item_id, timestamp
  for (let i = 0; i < sales.length; i++) {
    price = sales[i]["price"]["amount"]["usd"]
    item_id = sales[i]["token"]["tokenId"]
    timestamp = new Date(sales[i]["timestamp"] * 1000)

    let tx: Transaction = {
      price: price,
      itemId: item_id,
      timestamp: timestamp
    }

    tx_list.push(tx)
  }

  if (sales.length < 1000) {
    break
  }

}

console.log("number of transactions requested:", tx_list.length)

console.log(tami(tx_list))