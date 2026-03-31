# ⬡ CertChain — Blockchain Certificate Verification System

> Immutable · Trustless · Multi-Sig · Cross-Platform

A production-ready, full-stack blockchain certificate verification system built on Ethereum/Polygon with Google Auth, wallet linking, and multi-signature security throughout.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      CERTCHAIN SYSTEM                           │
├──────────────┬──────────────────┬──────────────────────────────┤
│  Web App     │  React Native    │  Smart Contract              │
│  (HTML/JS)   │  (iOS + Android) │  (Solidity · Polygon)        │
├──────────────┴──────────────────┴──────────────────────────────┤
│                    FastAPI Backend (Python)                     │
│          Web3.py · SHA-256 Hashing · IPFS Client               │
├─────────────────────────────────────────────────────────────────┤
│  Blockchain           IPFS             PostgreSQL               │
│  Ethereum/Polygon     Distributed      Metadata cache           │
│  BSC                  Storage          User sessions            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity 0.8.19 · Hardhat · OpenZeppelin |
| Blockchain | Ethereum · Polygon · BSC (configurable) |
| Backend | Python 3.11 · FastAPI · Web3.py |
| Auth | Google OAuth 2.0 · EIP-191 wallet signing |
| Storage | IPFS (ipfs-http-client) · PostgreSQL |
| Web Frontend | HTML5 · CSS3 · Vanilla JS (zero dependencies) |
| Mobile App | React Native · Expo · WalletConnect v2 |
| Cryptography | SHA-256 · Multi-sig (M-of-N threshold) |

---

## Project Structure

```
certchain/
├── contracts/
│   └── CertificateRegistry.sol    # Core smart contract
├── backend/
│   └── main.py                    # FastAPI server
├── mobile/
│   └── App.tsx                    # React Native app
├── index.html                     # Web dashboard
└── README.md
```

---

## Quick Start

### 1. Smart Contract Deployment

```bash
# Install Hardhat
npm init -y && npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Initialize Hardhat
npx hardhat init

# Copy contract to contracts/
cp certchain/contracts/CertificateRegistry.sol contracts/

# Compile
npx hardhat compile

# Deploy to Polygon Mumbai testnet
npx hardhat run scripts/deploy.js --network mumbai
```

**deploy.js:**
```js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const CertReg = await ethers.getContractFactory("CertificateRegistry");
  const contract = await CertReg.deploy([deployer.address]); // initial admins

  await contract.waitForDeployment();
  console.log("CertificateRegistry deployed to:", await contract.getAddress());
}

main().catch(console.error);
```

### 2. Backend Setup

```bash
cd backend

pip install fastapi uvicorn web3 python-dotenv httpx qrcode pillow ipfshttpclient pydantic

# Configure environment
cat > .env << EOF
RPC_URL=https://polygon-rpc.com
CONTRACT_ADDRESS=0xYourContractAddress
PRIVATE_KEY=0xYourPrivateKey
CHAIN_ID=137
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
JWT_SECRET=your-super-secret-jwt-key
IPFS_API=/dns/localhost/tcp/5001/http
EOF

# Run server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Web App

Simply open `index.html` in a browser, or serve with:

```bash
npx serve . -p 3000
```

### 4. Mobile App

```bash
cd mobile

# Install Expo CLI
npm install -g expo-cli

# Install dependencies
npm install \
  @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack \
  react-native-safe-area-context react-native-screens \
  @react-native-google-signin/google-signin \
  @walletconnect/react-native-dapp \
  ethers \
  expo-camera expo-file-system

# Start dev server
expo start

# Build for production
eas build --platform all
```

### 5. IPFS Node (Optional)

```bash
# Install IPFS Desktop or run daemon
ipfs daemon
```

---

## API Reference

### Authentication

```
POST /auth/google
Body: { "id_token": "Google_OAuth_ID_Token" }
→ { "session_token": "...", "user": {...}, "message": "Link your wallet" }

POST /auth/link-wallet
Body: { "wallet_address": "0x...", "signature": "0x...", "message": "..." }
→ { "wallet_linked": true }
```

### Certificates

```
POST /issue
Body: {
  "recipient_name": "Alex Johnson",
  "institution": "MIT",
  "course": "BSc Computer Science",
  "issue_date": "2024-11-27",
  "signers": ["0x...", "0x...", "0x..."],
  "threshold": 2
}
→ { "status": "pending_signatures", "cert_hash": "0x...", "tx_hash": "0x..." }

POST /verify
Body: { "cert_hash": "0x3a7b8c..." }
→ { "valid": true, "status": "VALID", "issuer": "0x...", "issued_at": "..." }

POST /verify/file
Body: multipart/form-data (PDF, PNG, JPG, JSON)
→ { "valid": true, "filename": "cert.pdf", ... }

POST /revoke
Body: { "cert_hash": "0x...", "reason": "...", "signers": [...], "threshold": 3 }

POST /sign/{request_id}    # Sign a multi-sig request

GET  /certificate/{hash}   # Fetch certificate details
GET  /health               # System health check
GET  /stats                # Platform statistics
```

---

## Smart Contract — Key Functions

```solidity
// Issue (multi-sig path)
createIssuanceRequest(bytes32 hash, address[] signers, uint8 threshold, string cid, string uri)

// Issue (direct, admin+issuer only)
issueCertificateDirect(bytes32 hash, string cid, string uri)

// Sign pending request (auto-executes at threshold)
sign(uint256 requestId)

// Verify (view, no gas)
verifyCertificateView(bytes32 hash) → (valid, revoked, issuer, timestamp)

// Revoke (multi-sig)
createRevocationRequest(bytes32 hash, address[] signers, uint8 threshold)
```

---

## Security Model

### Multi-Signature Policies
- **Issuance**: Default 2-of-3 (Admin + Issuer must both sign)
- **Revocation**: Default 3-of-3 (full consensus required)
- **Emergency**: Direct issuance requires holder of both ADMIN + ISSUER roles
- **Expiry**: Multi-sig requests expire after 7 days

### Cryptography
- Certificate data → canonical JSON → SHA-256 → `bytes32` on-chain
- Only the hash is stored on-chain (never the full document)
- IPFS CID links to full document (content-addressed, tamper-evident)
- EIP-191 personal_sign for wallet authentication

### Access Control (On-Chain)
```
ADMIN_ROLE   → grant/revoke roles, create revocation requests
ISSUER_ROLE  → create issuance requests
AUDITOR_ROLE → signing authority for multi-sig
```

---

## Google Auth Flow

```
1. User clicks "Continue with Google"
2. Google Sign-In SDK → OAuth 2.0 popup/redirect
3. Receive id_token from Google
4. POST /auth/google { id_token }
5. Server verifies token with Google APIs
6. Return session token + user info
7. Prompt: "Link your crypto wallet"
8. WalletConnect / MetaMask deep link
9. User signs EIP-191 message to prove ownership
10. POST /auth/link-wallet { wallet_address, signature, message }
11. Full access granted
```

---

## Mobile App — Key Dependencies

```json
{
  "dependencies": {
    "expo": "~51.0.0",
    "@react-navigation/native": "^6.x",
    "@react-navigation/bottom-tabs": "^6.x",
    "@react-native-google-signin/google-signin": "^11.x",
    "@walletconnect/react-native-dapp": "^1.x",
    "ethers": "^6.x",
    "expo-camera": "~15.x",
    "react-native-safe-area-context": "4.x"
  }
}
```

---

## Deployment Checklist

- [ ] Deploy smart contract to Polygon mainnet
- [ ] Copy ABI to `contracts/CertificateRegistry.abi.json`
- [ ] Set all `.env` variables (never commit private keys)
- [ ] Configure Google Cloud Console OAuth credentials
- [ ] Set up IPFS node or use Pinata/Web3.Storage
- [ ] Run backend with `uvicorn` behind nginx/caddy
- [ ] Build and publish mobile app via Expo EAS
- [ ] Grant ISSUER_ROLE to authorized wallets on-chain
- [ ] Test full issuance → verify → revoke flow

---

## License

MIT — CertChain is open-source and free to deploy.

---

*Built with ⬡ on Polygon · SHA-256 · Multi-Sig · IPFS*
# CERTCHAIN_SYSTEM
