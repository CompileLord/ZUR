import type { DatabaseSync } from 'node:sqlite';

/** New courses start with an empty theory step; fixtures that publish right away give it real text. */
export function writeStarterStep(db: DatabaseSync, courseId: string, markdown = 'An introduction to this course.'): void {
  db.prepare(`UPDATE step_contents SET content_payload = ? WHERE step_id IN (
    SELECT s.id FROM steps s JOIN lessons l ON l.id = s.lesson_id JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = ? AND s.title = 'Course Introduction')`).run(JSON.stringify({ kind: 'theory', markdown }), courseId);
}
