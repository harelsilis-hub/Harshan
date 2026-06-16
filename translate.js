const fs = require('fs');
let code = fs.readFileSync('public/js/app.js', 'utf8');

const map = {
  'Loading…': 'טוען...',
  'Something went wrong': 'משהו השתבש',
  '📚 Your Courses': '📚 הקורסים שלך',
  'New Course': 'קורס חדש',
  'No courses yet. Create one to start learning!': 'אין קורסים עדיין. צור אחד כדי להתחיל ללמוד!',
  'Delete': 'מחק',
  'Lectures': 'הרצאות',
  'Cards': 'כרטיסיות',
  'Due Now': 'לביצוע כעת',
  'Create a New Course': 'צור קורס חדש',
  'Course Name': 'שם הקורס',
  'e.g. Linear Algebra': 'למשל: אלגברה לינארית',
  'Cancel': 'ביטול',
  'Create Course': 'צור קורס',
  'Course created!': 'הקורס נוצר!',
  'Ready to Learn': 'מוכן ללמידה',
  'Upload a new lecture to start the 4-stage learning sequence.': 'העלה הרצאה חדשה כדי להתחיל ברצף הלמידה.',
  'Lecture Title': 'שם ההרצאה',
  'e.g. Chapter 5: Eigenvalues & Eigenvectors': 'למשל: פרק 5: ערכים עצמיים',
  'Pages to Extract (Optional)': 'עמודים לחילוץ (אופציונלי)',
  'e.g. 1-5, 8, 11-13': 'למשל: 1-5, 8, 11-13',
  'Drop your PDF here or click to browse': 'גרור את ה-PDF שלך לכאן או לחץ לעיון',
  'Max 50 MB · PDF files only': 'עד 50 מגה-בייט · קבצי PDF בלבד',
  'Upload & Start Learning Sequence': 'העלה והתחל רצף למידה',
  'Lecture History': 'היסטוריית הרצאות',
  'Learning Sequence': 'רצף למידה',
  'Follow the steps to master the material.': 'עקוב אחר השלבים כדי לשלוט בחומר.',
  'Stage 1: Review Previous Lectures': 'שלב 1: חזרה על הרצאות קודמות',
  'There are no questions for review right now. You are all caught up!': 'אין שאלות לחזרה כרגע. אתה מעודכן!',
  'Continue to Summary →': 'המשך לסיכום →',
  'Sequence completed! 🎉': 'הרצף הושלם! 🎉',
  'Answer ${totalCards - currentIndex} questions before learning new material.': 'ענה על ${totalCards - currentIndex} שאלות לפני למידת החומר החדש.',
  'Review Progress': 'התקדמות',
  'Correct Answer': 'תשובה נכונה',
  'Continue': 'המשך',
  'Finish Review': 'סיים חזרה',
  'Stage 2: New Lecture Summary': 'שלב 2: סיכום הרצאה חדשה',
  'Read the AI-generated summary of your new material.': 'קרא את הסיכום שהופק על ידי ה-AI.',
  'Start Questions on New Lecture →': 'התחל שאלות על ההרצאה החדשה →',
  'Stage 3: New Material Quiz': 'שלב 3: בוחן על חומר חדש',
  'Test your knowledge immediately on the new concepts.': 'בחן את הידע שלך מיד על המושגים החדשים.',
  'Finish Sequence': 'סיים רצף',
  'Processing…': 'מעבד...',
  'Only PDF files are accepted': 'מתקבלים קבצי PDF בלבד'
};

for (const [en, he] of Object.entries(map)) {
  code = code.split(en).join(he);
}

fs.writeFileSync('public/js/app.js', code);
console.log('Done translating app.js');
