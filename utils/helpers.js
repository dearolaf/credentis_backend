const crypto = require('crypto');

/**
 * Generate a mock passport OCR result
 */
function mockPassportOCR(nationality) {
  const names = {
    'Irish': { first: 'Sean', last: 'Murphy' },
    'Polish': { first: 'Piotr', last: 'Kowalski' },
    'Romanian': { first: 'Andrei', last: 'Popescu' },
    'German': { first: 'Hans', last: 'Mueller' },
    'British': { first: 'James', last: 'Smith' },
  };
  const name = names[nationality] || names['Irish'];
  
  return {
    status: 'success',
    confidence: 0.97,
    data: {
      firstName: name.first,
      lastName: name.last,
      dateOfBirth: '1985-03-15',
      nationality: nationality || 'Irish',
      passportNumber: `P${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      expiryDate: '2028-06-30',
      gender: 'M'
    }
  };
}

/**
 * Mock biometric verification
 */
function mockBiometricCheck() {
  return {
    status: 'verified',
    confidence: 0.99,
    method: 'facial_recognition',
    timestamp: new Date().toISOString()
  };
}

/**
 * Mock Right-to-Work check
 */
function mockRightToWorkCheck(nationality, country) {
  const euCountries = ['Ireland', 'Germany', 'France', 'Poland', 'Romania', 'Spain', 'Italy', 'Netherlands'];
  const euNationalities = ['Irish', 'German', 'French', 'Polish', 'Romanian', 'Spanish', 'Italian', 'Dutch'];
  
  const isEU = euNationalities.includes(nationality);
  
  return {
    status: isEU ? 'eligible' : 'requires_visa',
    nationality,
    workCountry: country || 'Ireland',
    euCitizen: isEU,
    checkDate: new Date().toISOString(),
    validUntil: isEU ? null : '2026-12-31',
    notes: isEU ? 'EU freedom of movement applies' : 'Work visa required'
  };
}

/**
 * Mock SafePass expiry check with color coding
 */
function mockSafePassCheck(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
  
  let status, color;
  if (daysUntilExpiry < 0) {
    status = 'expired';
    color = 'red';
  } else if (daysUntilExpiry <= 30) {
    status = 'expiring_soon';
    color = 'amber';
  } else {
    status = 'valid';
    color = 'green';
  }
  
  return { status, color, daysUntilExpiry, expiryDate };
}

/**
 * Mock PQQ financial/compliance check
 */
function mockPQQCheck(companyData) {
  return {
    financialHealth: {
      status: Math.random() > 0.2 ? 'pass' : 'review_required',
      creditScore: Math.floor(Math.random() * 300) + 600,
      turnover: '$' + (Math.floor(Math.random() * 50) + 5) + 'M',
      insuranceCurrent: true
    },
    complianceFlags: {
      taxCompliant: true,
      insuranceValid: true,
      safetyRecord: Math.random() > 0.1 ? 'clean' : 'minor_incidents',
      environmentalCompliance: true
    },
    overallStatus: Math.random() > 0.15 ? 'pass' : 'review_required',
    checkedAt: new Date().toISOString()
  };
}

/**
 * Generate random date within range
 */
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];
}

/**
 * Format response
 */
function apiResponse(res, statusCode, data, message) {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    data,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  mockPassportOCR,
  mockBiometricCheck,
  mockRightToWorkCheck,
  mockSafePassCheck,
  mockPQQCheck,
  randomDate,
  apiResponse
};
