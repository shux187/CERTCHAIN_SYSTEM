// scripts/deploy.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════");
  console.log("  CertChain — Smart Contract Deployment");
  console.log("═══════════════════════════════════════════");
  console.log("Deployer address:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "MATIC");

  // Deploy with deployer as initial admin
  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
  const contract = await CertificateRegistry.deploy([deployer.address]);

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n✅ CertificateRegistry deployed to:", contractAddress);
  console.log("   Network:", (await ethers.provider.getNetwork()).name);
  console.log("   Chain ID:", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("   Block:", await ethers.provider.getBlockNumber());

  // Export ABI for backend
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "CertificateRegistry.sol", "CertificateRegistry.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    // Write ABI to backend folder
    const backendAbiPath = path.join(__dirname, "..", "backend", "CertificateRegistry.abi.json");
    fs.writeFileSync(backendAbiPath, JSON.stringify(artifact.abi, null, 2));
    console.log("\n📄 ABI exported to: backend/CertificateRegistry.abi.json");

    // Write ABI to mobile folder
    const mobileAbiPath = path.join(__dirname, "..", "mobile", "CertificateRegistry.abi.json");
    fs.writeFileSync(mobileAbiPath, JSON.stringify(artifact.abi, null, 2));
    console.log("📄 ABI exported to: mobile/CertificateRegistry.abi.json");
  }

  // Write deployment info
  const deploymentInfo = {
    contractAddress,
    deployer: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n📋 Deployment info saved to: deployment.json");

  // Print .env snippet
  console.log("\n─── Add to your .env ───────────────────────");
  console.log(`CONTRACT_ADDRESS=${contractAddress}`);
  console.log("────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
