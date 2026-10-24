/**
 * ApplyOnce Phase 4 - Field Matcher Service
 *
 * Maps detected form fields to saved profile keys using:
 *  - Explicit synonym dictionaries per profile key
 *  - Negative signal lists to prevent false positives
 *  - Confidence scoring: HIGH (≥0.75), MEDIUM (0.45–0.74), LOW (<0.45)
 *  - Reasoning explanations for every match decision
 *
 * Strictly read-only — never modifies the DOM.
 */

export const CONFIDENCE = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

export const CONFIDENCE_THRESHOLD = {
  HIGH: 0.75,
  MEDIUM: 0.45,
};

/**
 * Synonym dictionary.
 * Each profile key maps to an array of terms that strongly imply that field.
 * Order within each array is irrelevant; all matches are scored uniformly.
 */
const SYNONYMS = {
  fullName: [
    'full name', 'fullname', 'full_name', 'legal name', 'complete name',
    'applicant name', 'your name', 'name on application',
  ],
  firstName: [
    'first name', 'firstname', 'first_name', 'given name', 'forename',
    'preferred name', 'first', 'fname',
  ],
  lastName: [
    'last name', 'lastname', 'last_name', 'family name', 'surname',
    'second name', 'lname',
  ],
  email: [
    'email', 'e-mail', 'email address', 'mail', 'electronic mail',
    'work email', 'contact email', 'primary email',
  ],
  phone: [
    'phone', 'phone number', 'mobile', 'mobile number', 'cell', 'telephone',
    'tel', 'contact number', 'whatsapp', 'sms',
  ],
  location: [
    'location', 'city', 'state', 'address', 'current city', 'home city',
    'residence', 'hometown', 'zip', 'postal', 'country',
  ],
  college: [
    'college', 'university', 'school', 'institution', 'academic institution',
    'alma mater', 'education', 'educational institution',
  ],
  degree: [
    'degree', 'qualification', 'major', 'field of study', 'programme',
    'program', 'course of study', 'academic degree', 'study program',
  ],
  graduationYear: [
    'graduation year', 'grad year', 'year of graduation', 'expected graduation',
    'graduating year', 'expected grad', 'class of', 'graduation date',
    'pass out year', 'passout year',
  ],
  skills: [
    'skills', 'technical skills', 'key skills', 'competencies', 'expertise',
    'technologies', 'proficiencies', 'tools', 'languages known',
  ],
  github: [
    'github', 'git hub', 'github url', 'github profile', 'github link',
    'github.com', 'source code', 'code repository', 'repository url',
  ],
  linkedin: [
    'linkedin', 'linked in', 'linkedin url', 'linkedin profile', 'linkedin link',
    'linkedin.com', 'professional profile',
  ],
  leetcode: [
    'leetcode', 'leet code', 'leetcode profile', 'leetcode url', 'leetcode.com',
    'competitive programming', 'coding profile',
  ],
  portfolio: [
    'portfolio', 'portfolio url', 'personal website', 'personal site', 'website',
    'web portfolio', 'blog', 'personal blog', 'project site',
  ],
};

/**
 * Negative signals per profile key.
 * If ANY negative signal matches the field text, the score is heavily penalised.
 */
const NEGATIVE_SIGNALS = {
  firstName: ['last', 'surname', 'family'],
  lastName: ['first', 'given', 'forename', 'fname'],
  email: ['confirm', 'password', 'repeat', 'retype'],
  phone: ['fax', 'work phone', 'emergency'],
  github: ['gitlab', 'bitbucket', 'jira'],
  portfolio: ['github', 'linkedin', 'leetcode'],
  leetcode: ['github', 'linkedin', 'portfolio'],
  linkedin: ['github', 'leetcode', 'portfolio'],
};

/**
 * Input-type bonuses.
 * If the field type directly implies a profile key the score is boosted.
 */
const TYPE_BONUSES = {
  email: { keys: ['email'], bonus: 0.20 },
  tel: { keys: ['phone'], bonus: 0.20 },
  url: { keys: ['github', 'linkedin', 'leetcode', 'portfolio'], bonus: 0.10 },
  number: { keys: ['graduationYear', 'phone'], bonus: 0.05 },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise text for matching: lowercase, collapse whitespace, strip punctuation.
 */
function normalise(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[_\-]/g, ' ')   // treat underscores / hyphens as spaces
    .replace(/[^a-z0-9\s]/g, '') // strip remaining punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple substring match: returns true if needle appears in haystack.
 */
function contains(haystack, needle) {
  return haystack.includes(needle);
}

/**
 * Score how well a single candidate phrase matches all synonyms for a key.
 * Returns a value in [0, 1].
 */
function scoreSynonyms(candidate, synonymList) {
  if (!candidate) return 0;

  let best = 0;

  for (const syn of synonymList) {
    const normSyn = normalise(syn);
    if (!normSyn) continue;

    if (candidate === normSyn) {
      // Exact match
      return 1.0;
    }

    if (contains(candidate, normSyn)) {
      // Candidate contains the synonym
      const ratio = normSyn.length / candidate.length;
      const score = 0.65 + 0.25 * ratio; // [0.65 – 0.90]
      best = Math.max(best, score);
    } else if (contains(normSyn, candidate)) {
      // Synonym contains the candidate (candidate is a sub-word)
      const ratio = candidate.length / normSyn.length;
      const score = 0.40 + 0.20 * ratio; // [0.40 – 0.60]
      best = Math.max(best, score);
    }
  }

  return best;
}

/**
 * Returns the negative-signal penalty for a profileKey given the candidate text.
 * @returns {number} penalty in [0, 0.40]
 */
function computeNegativePenalty(candidate, profileKey) {
  const negatives = NEGATIVE_SIGNALS[profileKey];
  if (!negatives) return 0;

  for (const neg of negatives) {
    if (contains(candidate, normalise(neg))) {
      return 0.40;
    }
  }
  return 0;
}

/**
 * Returns the type bonus for a profileKey given the field's input type.
 */
function computeTypeBonus(fieldType, profileKey) {
  const entry = TYPE_BONUSES[fieldType];
  if (!entry) return 0;
  return entry.keys.includes(profileKey) ? entry.bonus : 0;
}

// ─── Core Match Logic ────────────────────────────────────────────────────────

/**
 * Attempt to match one detected field against all profile keys.
 *
 * @param {Object} field  - Detected field descriptor from scanner
 * @param {Object} profile - Saved profile object
 * @returns {MatchResult|null}
 *
 * MatchResult shape:
 * {
 *   profileKey: string,
 *   proposedValue: string,
 *   confidence: 'HIGH'|'MEDIUM'|'LOW',
 *   score: number,        // raw [0,1]
 *   reason: string,       // human-readable explanation
 *   preselected: boolean, // true only for HIGH confidence
 * }
 */
export function matchField(field, profile) {
  if (!field || typeof field !== 'object') return null;
  if (!profile || typeof profile !== 'object') return null;

  // Build candidate strings from every text signal on the field
  const rawCandidates = [
    field.label,
    field.name,
    field.id,
    field.placeholder,
    field.accessibleDescription,
  ].map(normalise).filter(Boolean);

  if (rawCandidates.length === 0) return null;

  const fieldType = (field.type || '').toLowerCase();

  let bestKey = null;
  let bestScore = 0;
  let bestReason = '';

  for (const profileKey of Object.keys(SYNONYMS)) {
    // Skip keys that have no value in the profile
    const profileValue = profile[profileKey];
    if (profileValue === undefined) continue;

    const synonymList = SYNONYMS[profileKey];
    let keyScore = 0;
    let matchedSignal = '';
    let matchedSynonym = '';

    // Score each candidate signal; keep the best
    for (const candidate of rawCandidates) {
      const rawScore = scoreSynonyms(candidate, synonymList);
      if (rawScore > keyScore) {
        keyScore = rawScore;
        matchedSignal = candidate;

        // Find which synonym triggered the match (for explanation)
        for (const syn of synonymList) {
          if (candidate.includes(normalise(syn)) || normalise(syn).includes(candidate)) {
            matchedSynonym = syn;
            break;
          }
        }
      }
    }

    if (keyScore === 0) continue;

    // Apply negative-signal penalty
    const combinedCandidate = rawCandidates.join(' ');
    const penalty = computeNegativePenalty(combinedCandidate, profileKey);
    keyScore = Math.max(0, keyScore - penalty);

    // Apply type bonus
    const typeBonus = computeTypeBonus(fieldType, profileKey);
    keyScore = Math.min(1.0, keyScore + typeBonus);

    if (keyScore > bestScore) {
      bestScore = keyScore;
      bestKey = profileKey;

      const signalSource = matchedSignal || rawCandidates[0];
      const bonusNote = typeBonus > 0 ? ` (type="${fieldType}" bonus +${Math.round(typeBonus * 100)}%)` : '';
      const penaltyNote = penalty > 0 ? ` (negative signal penalty -${Math.round(penalty * 100)}%)` : '';
      bestReason = `Matched "${signalSource}" → synonym "${matchedSynonym || profileKey}"${bonusNote}${penaltyNote}`;
    }
  }

  if (!bestKey) return null;

  // Determine confidence tier
  let confidence;
  if (bestScore >= CONFIDENCE_THRESHOLD.HIGH) {
    confidence = CONFIDENCE.HIGH;
  } else if (bestScore >= CONFIDENCE_THRESHOLD.MEDIUM) {
    confidence = CONFIDENCE.MEDIUM;
  } else {
    confidence = CONFIDENCE.LOW;
  }

  const proposedValue = String(profile[bestKey] ?? '');

  return {
    profileKey: bestKey,
    proposedValue,
    confidence,
    score: parseFloat(bestScore.toFixed(3)),
    reason: bestReason,
    preselected: confidence === CONFIDENCE.HIGH,
  };
}

/**
 * Match all detected fields from a scan result against a profile.
 *
 * @param {Array} fields   - Array of detected field objects from scanner
 * @param {Object} profile - Saved profile
 * @returns {Array<FieldMatchRow>}
 *
 * FieldMatchRow shape:
 * {
 *   field: Object,           // original field descriptor
 *   match: MatchResult|null, // null means no match found
 *   selected: boolean,       // starts as preselected for HIGH confidence
 *   editedValue: string,     // user-editable proposed value copy
 * }
 */
export function matchAllFields(fields, profile) {
  if (!Array.isArray(fields) || !profile) return [];

  return fields.map((field) => {
    const match = matchField(field, profile);
    return {
      field,
      match,
      selected: match ? match.preselected : false,
      editedValue: match ? match.proposedValue : '',
    };
  });
}

/**
 * Returns a human-readable label for a profile key.
 */
export function profileKeyLabel(key) {
  const labels = {
    fullName: 'Full Name',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email Address',
    phone: 'Phone Number',
    location: 'Location / City',
    college: 'College / University',
    degree: 'Degree / Major',
    graduationYear: 'Graduation Year',
    skills: 'Skills',
    github: 'GitHub URL',
    linkedin: 'LinkedIn URL',
    leetcode: 'LeetCode URL',
    portfolio: 'Portfolio / Website',
  };
  return labels[key] || key;
}
