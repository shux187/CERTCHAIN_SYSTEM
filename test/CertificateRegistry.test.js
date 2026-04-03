// test/CertificateRegistry.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const crypto = require("crypto");

function sha256(str) {
  return "0x" + crypto.createHash("sha256").update(str).digest("hex");
}

function strToBytes32(str) {
  const hex = crypto.createHash("sha256").update(str).digest("hex");
  return "0x" + hex;
}

describe("CertificateRegistry", function () {
  let contract, owner, admin2, issuer, auditor, verifier;

  const ADMIN_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const ISSUER_ROLE  = ethers.keccak256(ethers.toUtf8Bytes("ISSUER_ROLE"));
  const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));

  beforeEach(async () => {
    [owner, admin2, issuer, auditor, verifier] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CertificateRegistry");
    contract = await Factory.deploy([owner.address, admin2.address]);
    await contract.waitForDeployment();

    // Grant roles
    await contract.grantRole(ISSUER_ROLE, issuer.address);
    await contract.grantRole(AUDITOR_ROLE, auditor.address);
  });

  describe("Role Management", () => {
    it("owner has ADMIN_ROLE", async () => {
      expect(await contract.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
    });
    it("can grant ISSUER_ROLE", async () => {
      expect(await contract.hasRole(ISSUER_ROLE, issuer.address)).to.be.true;
    });
    it("non-admin cannot grant roles", async () => {
      await expect(
        contract.connect(verifier).grantRole(ISSUER_ROLE, verifier.address)
      ).to.be.revertedWith("CertReg: missing role");
    });
  });

  describe("Direct Issuance", () => {
    let certHash;
    beforeEach(async () => {
      // Owner has both ADMIN + ISSUER for direct issuance
      await contract.grantRole(ISSUER_ROLE, owner.address);
      certHash = ethers.encodeBytes32String("CERT-001");
    });

    it("emits CertificateIssued event", async () => {
      await expect(
        contract.issueCertificateDirect(certHash, "QmTestCid", "ipfs://meta")
      ).to.emit(contract, "CertificateIssued").withArgs(certHash, owner.address, await getTimestamp(), "QmTestCid");
    });

    it("cannot issue duplicate", async () => {
      await contract.issueCertificateDirect(certHash, "", "");
      await expect(
        contract.issueCertificateDirect(certHash, "", "")
      ).to.be.revertedWith("CertReg: cert exists");
    });

    it("verifies valid certificate", async () => {
      await contract.issueCertificateDirect(certHash, "", "");
      const [valid, revoked] = await contract.verifyCertificateView(certHash);
      expect(valid).to.be.true;
      expect(revoked).to.be.false;
    });
  });

  describe("Multi-Sig Issuance", () => {
    let certHash;
    beforeEach(async () => {
      certHash = ethers.encodeBytes32String("CERT-MULTISIG-001");
    });

    it("creates issuance request and auto-executes at threshold", async () => {
      const signers = [owner.address, auditor.address];
      const threshold = 2;

      // Create request (issuer)
      const tx = await contract.connect(issuer).createIssuanceRequest(
        certHash, signers, threshold, "QmCid", ""
      );
      const receipt = await tx.wait();
      const requestId = 0;

      // First signature
      await contract.connect(owner).sign(requestId);

      // Second signature → auto-executes
      await expect(
        contract.connect(auditor).sign(requestId)
      ).to.emit(contract, "CertificateIssued");

      const [valid] = await contract.verifyCertificateView(certHash);
      expect(valid).to.be.true;
    });

    it("cannot sign twice", async () => {
      const signers = [owner.address, auditor.address];
      await contract.connect(issuer).createIssuanceRequest(certHash, signers, 2, "", "");
      await contract.connect(owner).sign(0);
      await expect(contract.connect(owner).sign(0)).to.be.revertedWith("CertReg: already signed");
    });

    it("unauthorized signer is rejected", async () => {
      const signers = [owner.address, auditor.address];
      await contract.connect(issuer).createIssuanceRequest(certHash, signers, 2, "", "");
      await expect(contract.connect(verifier).sign(0)).to.be.revertedWith("CertReg: not an authorized signer");
    });
  });

  describe("Revocation", () => {
    let certHash;
    beforeEach(async () => {
      certHash = ethers.encodeBytes32String("CERT-REVOKE-001");
      await contract.grantRole(ISSUER_ROLE, owner.address);
      await contract.issueCertificateDirect(certHash, "", "");
    });

    it("revocation requires multi-sig", async () => {
      const signers = [owner.address, auditor.address];
      await contract.createRevocationRequest(certHash, signers, 2);
      await contract.connect(owner).sign(0);
      await contract.connect(auditor).sign(0);

      const [valid, revoked] = await contract.verifyCertificateView(certHash);
      expect(valid).to.be.false;
      expect(revoked).to.be.true;
    });

    it("verification fails after revocation", async () => {
      const signers = [owner.address, auditor.address];
      await contract.createRevocationRequest(certHash, signers, 2);
      await contract.connect(owner).sign(0);
      await contract.connect(auditor).sign(0);

      const [valid] = await contract.verifyCertificateView(certHash);
      expect(valid).to.be.false;
    });
  });

  describe("Verification", () => {
    it("returns NOT_FOUND for unknown hash", async () => {
      const unknownHash = ethers.encodeBytes32String("UNKNOWN");
      const [valid, revoked, , timestamp] = await contract.verifyCertificateView(unknownHash);
      expect(valid).to.be.false;
      expect(revoked).to.be.false;
      expect(timestamp).to.equal(0);
    });
  });

  describe("Pagination", () => {
    it("returns paginated certificate hashes", async () => {
      await contract.grantRole(ISSUER_ROLE, owner.address);
      for (let i = 0; i < 5; i++) {
        await contract.issueCertificateDirect(
          ethers.encodeBytes32String(`CERT-${i}`), "", ""
        );
      }
      const page = await contract.getCertHashesPaginated(0, 3);
      expect(page.length).to.equal(3);
    });
  });

  async function getTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }
});
