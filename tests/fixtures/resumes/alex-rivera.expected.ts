import type { ResumeProfile } from '@/src/profile/resume';

// The correct parse of alex-rivera.pdf/.docx (FAKE person). Used as a pretend AI answer
// in unit tests and as the answer key for the live Gemini test.
export const ALEX_RIVERA_EXPECTED: ResumeProfile = {
  personal: {
    firstName: 'Alex',
    middleName: 'J.',
    lastName: 'Rivera',
    preferredName: '',
    email: 'alex.rivera@example.com',
    phone: { countryCode: '+1', number: '(555) 010-0142', type: 'mobile' },
    address: { line1: '', city: 'San Jose', state: 'CA', postalCode: '95112', country: 'USA' },
  },
  links: {
    linkedin: 'https://www.linkedin.com/in/alex-rivera-example',
    github: 'https://github.com/alex-rivera-example',
    portfolio: 'https://alexrivera.example.com',
    other: [],
  },
  workExperience: [
    {
      title: 'Senior Software Engineer',
      company: 'Example Compute Inc.',
      location: 'Santa Clara, CA',
      start: { month: 3, year: 2022 },
      end: null,
      current: true,
      description:
        'Led design of a parallel file system cache that cut GPU training data stalls by 40%.\nBuilt NCCL-based collective benchmarks across 512 GPUs.',
    },
    {
      title: 'Software Engineer',
      company: 'Sample Storage Systems',
      location: 'Austin, TX',
      start: { month: 6, year: 2019 },
      end: { month: 2, year: 2022 },
      current: false,
      description: 'Maintained Lustre and Ceph clusters serving 20 PB for HPC workloads.',
    },
  ],
  education: [
    { school: 'University of Example', degree: 'M.S.', fieldOfStudy: 'Computer Science', startYear: 2017, endYear: 2019, gpa: '3.8/4.0' },
    { school: 'Sample State University', degree: 'B.S.', fieldOfStudy: 'Computer Engineering', startYear: 2013, endYear: 2017, gpa: '' },
  ],
  skills: ['C++', 'Python', 'CUDA', 'NCCL', 'MPI', 'Lustre', 'Ceph', 'Kubernetes', 'Linux'],
  certifications: [{ name: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2021' }],
  languages: ['English', 'Spanish'],
  summary:
    'Systems engineer with 6 years of experience building high-performance storage and distributed training infrastructure.',
  meta: { warnings: [], confidence: 0.95 },
};
