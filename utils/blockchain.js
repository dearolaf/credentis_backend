const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Mock Blockchain Service
 * Simulates Hyperledger Fabric testnet operations
 * In production, this would connect to actual Hyperledger Fabric network
 */
class MockBlockchain {
  constructor() {
    this.ledger = [];
  }

  /**
   * Generate a SHA-256 hash for any data
   */
  static hash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Simulate anchoring data to blockchain
   * Returns a mock transaction ID and hash
   */
  static anchorData(data) {
    const dataHash = this.hash(data);
    const txId = `tx_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const blockNumber = Math.floor(Math.random() * 100000) + 1;
    
    return {
      transactionId: txId,
      dataHash,
      blockNumber,
      timestamp: new Date().toISOString(),
      network: 'hyperledger-fabric-testnet',
      channel: 'credentis-channel',
      chaincode: 'credentis-cc',
      status: 'VALID'
    };
  }

  /**
   * Simulate creating a Verifiable Credential
   */
  static createVC(type, subject, issuer, claims) {
    const vcId = `vc:credentis:${uuidv4()}`;
    const vc = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://credentis.io/credentials/v1'
      ],
      id: vcId,
      type: ['VerifiableCredential', type],
      issuer: {
        id: issuer.did || `did:credentis:${issuer.id}`,
        name: issuer.name || 'Credentis Platform'
      },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: subject.did || `did:credentis:${subject.id}`,
        ...claims
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `did:credentis:${issuer.id}#key-1`,
        proofPurpose: 'assertionMethod',
        proofValue: crypto.randomBytes(64).toString('base64')
      }
    };

    const blockchainRecord = this.anchorData(vc);
    
    return {
      vc,
      vcHash: blockchainRecord.dataHash,
      blockchainTx: blockchainRecord.transactionId,
      blockchainRecord
    };
  }

  /**
   * Simulate creating a DID (Decentralised Identifier)
   */
  static createDID(userId) {
    return `did:credentis:${crypto.createHash('sha256').update(userId).digest('hex').substring(0, 32)}`;
  }

  /**
   * Verify a credential hash against blockchain
   */
  static verifyCredential(vcHash) {
    // Mock verification - always returns valid for PoC
    return {
      isValid: true,
      verifiedAt: new Date().toISOString(),
      blockchainNetwork: 'hyperledger-fabric-testnet',
      message: 'Credential verified successfully on blockchain'
    };
  }

  /**
   * Tokenize sensitive data (e.g., passport numbers)
   */
  static tokenize(data) {
    return crypto.createHash('sha256').update(data + process.env.TOKEN_SALT || 'credentis-poc-salt').digest('hex');
  }
}

module.exports = MockBlockchain;
