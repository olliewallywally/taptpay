const { TextEncoder, TextDecoder } = require('util');

require('@testing-library/jest-dom');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock EventSource — jsdom has no SSE, and pages that call sseClient.connect()
// (customer-payment, merchant-terminal*) would otherwise throw "EventSource is
// not defined" at render.
global.EventSource = class EventSource {
  constructor() {
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
};

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
global.sessionStorage = localStorageMock;

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock crypto for secure random generation
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => '00000000-0000-0000-0000-000000000000',
  },
});

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

// R1-T8: a test fails when React reports a problem through console.error — an
// act(...) warning, any other "Warning: ...", a hook-order error, or an error a
// component threw during render. A test that provokes one on purpose replaces
// console.error itself (jest.spyOn) and asserts on what it captured.
const REACT_PROBLEM = /^Warning: |Rendered (?:fewer|more) hooks than|The above error occurred in the <|Uncaught \[/;
const originalError = console.error;
let reactProblems = [];
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    const first = args[0] instanceof Error ? args[0].message : String(args[0]);
    if (REACT_PROBLEM.test(first)) reactProblems.push(first.split('\n')[0]);
    originalError.call(console, ...args);
  };
});

beforeEach(() => {
  reactProblems = [];
});

afterEach(() => {
  const problems = reactProblems;
  reactProblems = [];
  if (problems.length > 0) {
    throw new Error(`React reported ${problems.length} problem(s) through console.error:\n  ${problems.join('\n  ')}`);
  }
});

afterAll(() => {
  console.error = originalError;
});