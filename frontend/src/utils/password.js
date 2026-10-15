export const PASSWORD_REQUIREMENTS = [
  { key: 'length', test: password => password.length >= 8 },
  { key: 'uppercase', test: password => /[A-Z]/.test(password) },
  { key: 'lowercase', test: password => /[a-z]/.test(password) },
  { key: 'number', test: password => /\d/.test(password) },
  { key: 'special', test: password => /[^A-Za-z0-9]/.test(password) },
];

export function getPasswordValidation(password) {
  const requirements = PASSWORD_REQUIREMENTS.map(requirement => ({
    ...requirement,
    met: requirement.test(password),
  }));

  return {
    requirements,
    isValid: requirements.every(requirement => requirement.met),
  };
}