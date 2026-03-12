const path = require('path');

const ROOT = __dirname;
const templates = {
  short: path.join(ROOT, 'templates', 'short-handoff-summary.md'),
  full: path.join(ROOT, 'templates', 'full-continuity-packet.md'),
  bootstrap: path.join(ROOT, 'templates', 'next-agent-bootstrap.md'),
};

const modes = {
  continuity: {
    outputs: ['full', 'short', 'bootstrap'],
    durableByDefault: false,
  },
  memoryPromotion: {
    outputs: ['full'],
    durableByDefault: true,
  },
  dual: {
    outputs: ['full', 'short', 'bootstrap'],
    durableByDefault: false,
    supportsPromotion: true,
  },
};

function listTemplates() {
  return { ...templates };
}

function listModes() {
  return { ...modes };
}

function getTemplatePath(name) {
  return templates[name] || null;
}

module.exports = { listTemplates, listModes, getTemplatePath };
