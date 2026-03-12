const db = require('../config/database');
const { parseTemplateFromXlsxFile } = require('../utils/pqqTemplateXlsx');
const { upsertTemplateBundle } = require('../utils/pqqTemplateImport');

const usage = () => {
  console.log('Usage: node scripts/importPqqTemplateFromXlsx.js "<xlsx_path>" [template_id] [template_name]');
};

const run = () => {
  const [, , xlsxPath, templateId, templateName] = process.argv;
  if (!xlsxPath) {
    usage();
    process.exit(1);
  }

  const bundle = parseTemplateFromXlsxFile(xlsxPath, {
    template_id: templateId || undefined,
    template_name: templateName || undefined,
  });
  const result = upsertTemplateBundle(db, bundle);
  console.log('PQQ template imported successfully:', result);
};

try {
  run();
} catch (error) {
  console.error('Failed to import PQQ template from xlsx:', error.message);
  process.exit(1);
}

