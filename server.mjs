import dotenv from 'dotenv';
import express from 'express';
import Web3 from 'web3'; // ← فقط همین
import cors from 'cors';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

dotenv.config();


const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [] });
await db.read();

// این خط باعث میشه دیتای پیش‌فرض تنظیم بشه
if (!db.data) {
  db.data = { users: [] };
  await db.write();
}

const app = express();
app.use(cors());
app.use(express.json());

const web3 = new Web3(process.env.RPC_URL);


const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);

const tokenContract = new web3.eth.Contract([
  // ERC20 ABI فقط متد transfer
  {
    "constant": false,
    "inputs": [
      { "name": "_to", "type": "address" },
      { "name": "_value", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "name": "", "type": "bool" }],
    "type": "function"
  }
], process.env.TOKEN_CONTRACT);

app.post('/claim', async (req, res) => {
  try {
    const { wallet, amount, ref } = req.body;
	const numericAmount = parseFloat(amount);

if (isNaN(numericAmount) || numericAmount <= 0) {
  return res.status(400).json({ error: 'Invalid amount value' });
}


if (!web3.utils.isAddress(wallet)) {
  return res.status(400).json({ error: 'Invalid wallet address' });
}

const user = db.data.users.find(u => u.wallet === wallet);
const today = new Date().toISOString().split('T')[0];
// مقدار برداشت‌شده تا الان در امروز
const claimedToday = user?.claims?.[today] || 0;

// مقدار مجاز روزانه بر اساس ماه‌های گذشته
const projectStart = new Date("2025-05-30");
const now = new Date();
const monthsPassed = (now.getFullYear() - projectStart.getFullYear()) * 12 + (now.getMonth() - projectStart.getMonth()) + 1;

let dailyLimit = 1;
if (monthsPassed === 1) dailyLimit = 24;
else if (monthsPassed <= 3) dailyLimit = 12;
else if (monthsPassed <= 6) dailyLimit = 5;
else if (monthsPassed <= 12) dailyLimit = 2;

// بررسی عبور از سقف
if (claimedToday + numericAmount > dailyLimit) {
  return res.status(400).json({ error: '📛 Claim limit exceeded for today.' });
}


if (!user) {
  db.data.users.push({
    wallet,
    mined: numericAmount,
    claimed: numericAmount,
    claims: {
      [today]: numericAmount
    },
    createdAt: new Date().toISOString()
  });
} else {
  if (!user.claims) {
    user.claims = {};
  }

  user.mined += numericAmount;
  user.claimed += numericAmount;
  user.claims[today] = (user.claims[today] || 0) + numericAmount;
}


await db.write();



    const decimals = 18; // برای توکن‌های ۱۸ دسیمال مثل BSC یا ETH
    const value = web3.utils.toWei(amount.toString(), 'ether');

    const tx = await tokenContract.methods.transfer(wallet, value).send({
      from: process.env.WALLET_ADDRESS,
      gas: 100000
    });
	if (ref && ref !== wallet && web3.utils.isAddress(ref)) {
  const bonus = web3.utils.toWei((amount * 0.1).toString(), 'ether');
  await tokenContract.methods.transfer(ref, bonus).send({
    from: process.env.WALLET_ADDRESS,
    gas: 100000
  });
}


    res.json({ success: true, txHash: tx.transactionHash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
