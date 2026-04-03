// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CertificateRegistry
 * @dev Blockchain-Based Certificate Verification System
 * @notice Immutable, tamper-proof certificate issuance and verification
 * Supports multi-signature approval, revocation, and role-based access control
 */
contract CertificateRegistry {

    // ─── ROLES ──────────────────────────────────────────────────────────────
    bytes32 public constant ADMIN_ROLE   = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE  = keccak256("ISSUER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // ─── STRUCTS ─────────────────────────────────────────────────────────────

    struct Certificate {
        bytes32  certHash;         // SHA-256 of certificate content
        address  issuer;           // Issuing wallet address
        uint256  timestamp;        // Block timestamp at issuance
        bool     isRevoked;        // Revocation status
        string   ipfsCid;          // Optional IPFS CID for full document
        string   metadataUri;      // JSON metadata URI
        uint8    signaturesCollected; // Multi-sig progress
        uint8    signaturesRequired;  // Threshold
    }

    struct MultiSigRequest {
        bytes32   certHash;
        address[] signers;
        mapping(address => bool) hasSigned;
        uint8     threshold;
        bool      executed;
        uint256   createdAt;
        RequestType reqType;
    }

    enum RequestType { ISSUE, REVOKE }

    struct Role {
        mapping(address => bool) members;
    }

    // ─── STATE ────────────────────────────────────────────────────────────────

    address public owner;

    /// certHash → Certificate
    mapping(bytes32 => Certificate) private certificates;

    /// Role → members
    mapping(bytes32 => Role) private roles;

    /// Multi-sig request ID → request
    mapping(uint256 => MultiSigRequest) private msigRequests;
    uint256 public msigRequestCount;

    /// List of all cert hashes (for enumeration)
    bytes32[] public allCertHashes;

    /// certHash → issuance request ID (for pending multi-sig)
    mapping(bytes32 => uint256) public pendingRequestId;

    // ─── EVENTS ───────────────────────────────────────────────────────────────

    event CertificateIssued(
        bytes32 indexed certHash,
        address indexed issuer,
        uint256 timestamp,
        string ipfsCid
    );

    event CertificateRevoked(
        bytes32 indexed certHash,
        address indexed revoker,
        uint256 timestamp
    );

    event CertificateVerified(
        bytes32 indexed certHash,
        address indexed verifier,
        bool isValid
    );

    event MultiSigRequestCreated(
        uint256 indexed requestId,
        bytes32 certHash,
        MultiSigRequest.RequestType reqType
    );

    event MultiSigSigned(
        uint256 indexed requestId,
        address indexed signer,
        uint8 signaturesCollected
    );

    event MultiSigExecuted(uint256 indexed requestId, bytes32 certHash);

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);

    // ─── MODIFIERS ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "CertReg: not owner");
        _;
    }

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, msg.sender), "CertReg: missing role");
        _;
    }

    modifier certExists(bytes32 certHash) {
        require(certificates[certHash].timestamp != 0, "CertReg: cert not found");
        _;
    }

    // ─── CONSTRUCTOR ──────────────────────────────────────────────────────────

    constructor(address[] memory initialAdmins) {
        owner = msg.sender;
        _grantRole(ADMIN_ROLE, msg.sender);
        for (uint i = 0; i < initialAdmins.length; i++) {
            _grantRole(ADMIN_ROLE, initialAdmins[i]);
        }
    }

    // ─── ROLE MANAGEMENT ─────────────────────────────────────────────────────

    function grantRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        roles[role].members[account] = false;
        emit RoleRevoked(role, account);
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return roles[role].members[account];
    }

    function _grantRole(bytes32 role, address account) internal {
        roles[role].members[account] = true;
        emit RoleGranted(role, account);
    }

    // ─── MULTI-SIG: CREATE REQUEST ────────────────────────────────────────────

    /**
     * @dev Create a multi-sig issuance request. Requires ISSUER_ROLE.
     * @param certHash      SHA-256 hash of the certificate
     * @param signers       Addresses that must sign
     * @param threshold     Minimum signatures required
     * @param ipfsCid       IPFS CID of the full certificate document
     * @param metadataUri   URI for JSON metadata
     */
    function createIssuanceRequest(
        bytes32 certHash,
        address[] calldata signers,
        uint8 threshold,
        string calldata ipfsCid,
        string calldata metadataUri
    ) external onlyRole(ISSUER_ROLE) returns (uint256 requestId) {
        require(certificates[certHash].timestamp == 0, "CertReg: cert exists");
        require(threshold > 0 && threshold <= signers.length, "CertReg: bad threshold");
        require(signers.length <= 10, "CertReg: too many signers");

        requestId = msigRequestCount++;
        MultiSigRequest storage req = msigRequests[requestId];
        req.certHash  = certHash;
        req.signers   = signers;
        req.threshold = threshold;
        req.reqType   = RequestType.ISSUE;
        req.createdAt = block.timestamp;

        // Pre-populate certificate as pending
        certificates[certHash] = Certificate({
            certHash:             certHash,
            issuer:               msg.sender,
            timestamp:            0, // not yet confirmed
            isRevoked:            false,
            ipfsCid:              ipfsCid,
            metadataUri:          metadataUri,
            signaturesCollected:  0,
            signaturesRequired:   threshold
        });

        pendingRequestId[certHash] = requestId;
        emit MultiSigRequestCreated(requestId, certHash, RequestType.ISSUE);
    }

    /**
     * @dev Create a multi-sig revocation request. Requires ADMIN_ROLE.
     */
    function createRevocationRequest(
        bytes32 certHash,
        address[] calldata signers,
        uint8 threshold
    ) external onlyRole(ADMIN_ROLE) certExists(certHash) returns (uint256 requestId) {
        require(!certificates[certHash].isRevoked, "CertReg: already revoked");

        requestId = msigRequestCount++;
        MultiSigRequest storage req = msigRequests[requestId];
        req.certHash  = certHash;
        req.signers   = signers;
        req.threshold = threshold;
        req.reqType   = RequestType.REVOKE;
        req.createdAt = block.timestamp;

        emit MultiSigRequestCreated(requestId, certHash, RequestType.REVOKE);
    }

    // ─── MULTI-SIG: SIGN ─────────────────────────────────────────────────────

    /**
     * @dev Sign a pending multi-sig request. Auto-executes when threshold is reached.
     */
    function sign(uint256 requestId) external {
        MultiSigRequest storage req = msigRequests[requestId];
        require(!req.executed, "CertReg: already executed");
        require(block.timestamp <= req.createdAt + 7 days, "CertReg: request expired");
        require(!req.hasSigned[msg.sender], "CertReg: already signed");

        // Verify signer is authorized
        bool isAuthorized = false;
        for (uint i = 0; i < req.signers.length; i++) {
            if (req.signers[i] == msg.sender) { isAuthorized = true; break; }
        }
        require(isAuthorized, "CertReg: not an authorized signer");

        req.hasSigned[msg.sender] = true;
        certificates[req.certHash].signaturesCollected++;
        emit MultiSigSigned(requestId, msg.sender, certificates[req.certHash].signaturesCollected);

        // Auto-execute when threshold reached
        if (certificates[req.certHash].signaturesCollected >= req.threshold) {
            _executeRequest(requestId);
        }
    }

    function _executeRequest(uint256 requestId) internal {
        MultiSigRequest storage req = msigRequests[requestId];
        req.executed = true;

        if (req.reqType == RequestType.ISSUE) {
            certificates[req.certHash].timestamp = block.timestamp;
            allCertHashes.push(req.certHash);
            emit CertificateIssued(
                req.certHash,
                certificates[req.certHash].issuer,
                block.timestamp,
                certificates[req.certHash].ipfsCid
            );
        } else {
            certificates[req.certHash].isRevoked = true;
            emit CertificateRevoked(req.certHash, msg.sender, block.timestamp);
        }

        emit MultiSigExecuted(requestId, req.certHash);
    }

    // ─── DIRECT ISSUANCE (single signer, no multi-sig) ───────────────────────

    /**
     * @dev Issue a certificate directly (requires both ISSUER_ROLE and ADMIN_ROLE).
     * Used for emergency issuance or when multi-sig threshold is 1.
     */
    function issueCertificateDirect(
        bytes32 certHash,
        string calldata ipfsCid,
        string calldata metadataUri
    ) external {
        require(hasRole(ISSUER_ROLE, msg.sender) && hasRole(ADMIN_ROLE, msg.sender),
            "CertReg: requires admin+issuer");
        require(certificates[certHash].timestamp == 0, "CertReg: cert exists");

        certificates[certHash] = Certificate({
            certHash:             certHash,
            issuer:               msg.sender,
            timestamp:            block.timestamp,
            isRevoked:            false,
            ipfsCid:              ipfsCid,
            metadataUri:          metadataUri,
            signaturesCollected:  1,
            signaturesRequired:   1
        });

        allCertHashes.push(certHash);
        emit CertificateIssued(certHash, msg.sender, block.timestamp, ipfsCid);
    }

    // ─── VERIFICATION ─────────────────────────────────────────────────────────

    /**
     * @dev Verify a certificate hash against on-chain records.
     * @return valid    True if certificate exists and is not revoked
     * @return revoked  True if certificate was revoked
     * @return issuer   Address of the original issuer
     * @return timestamp Block timestamp of issuance
     */
    function verifyCertificate(bytes32 certHash)
        external
        returns (bool valid, bool revoked, address issuer, uint256 timestamp)
    {
        Certificate storage cert = certificates[certHash];
        valid     = cert.timestamp != 0 && !cert.isRevoked;
        revoked   = cert.isRevoked;
        issuer    = cert.issuer;
        timestamp = cert.timestamp;

        emit CertificateVerified(certHash, msg.sender, valid);
    }

    /**
     * @dev View-only verification (no gas, no event).
     */
    function verifyCertificateView(bytes32 certHash)
        external
        view
        returns (bool valid, bool revoked, address issuer, uint256 timestamp)
    {
        Certificate storage cert = certificates[certHash];
        valid     = cert.timestamp != 0 && !cert.isRevoked;
        revoked   = cert.isRevoked;
        issuer    = cert.issuer;
        timestamp = cert.timestamp;
    }

    // ─── GETTERS ─────────────────────────────────────────────────────────────

    function getCertificateDetails(bytes32 certHash)
        external
        view
        certExists(certHash)
        returns (Certificate memory)
    {
        return certificates[certHash];
    }

    function getMultiSigRequestSigners(uint256 requestId)
        external
        view
        returns (address[] memory)
    {
        return msigRequests[requestId].signers;
    }

    function hasSignedRequest(uint256 requestId, address signer)
        external
        view
        returns (bool)
    {
        return msigRequests[requestId].hasSigned[signer];
    }

    function getTotalCertificates() external view returns (uint256) {
        return allCertHashes.length;
    }

    function getCertHashesPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory)
    {
        uint256 end = offset + limit;
        if (end > allCertHashes.length) end = allCertHashes.length;
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allCertHashes[i];
        }
        return result;
    }
}
