import fs from 'fs';
import path from 'path';

// قائمة الملفات المستهدفة بالإصلاح
const targetFiles = [
  path.join('server', 'routes', 'learningRoutes.ts'),
  path.join('server', 'routes', 'ranksRoutes.ts'),
];

targetFiles.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // إصلاح علامات الهروب الخاطئة مثل \$ وتصحيح امتدادات الترجمة
    content = content.replace(/\\\$/g, '$');
    content = content.replace(/\.srt\$/i, '.srt');

    // التأكد من وجود export default router في نهاية الملف إذا لم تكن موجودة
    if (!content.includes('export default router;')) {
      content = content.trim() + '\n\nexport default router;\n';
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[AutoFix] Successfully cleaned and fixed: ${filePath}`);
  } else {
    console.log(`[AutoFix] File not found: ${filePath}`);
  }
});
