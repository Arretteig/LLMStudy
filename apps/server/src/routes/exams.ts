import { Router } from 'express';
import { getDb } from '../db';
import {
  createExam,
  examReadiness,
  finishExam,
  getExam,
  listExams,
  updateExamItem,
} from '../exams.repo';

export const examsRouter = Router();

// GET /api/exams/readiness -> mock-exam-based score estimate + history.
// Registered BEFORE /:id so 'readiness' is not parsed as a session id.
examsRouter.get('/readiness', (_req, res) => {
  res.json(examReadiness(getDb()));
});

// GET /api/exams -> all sessions, newest first
examsRouter.get('/', (_req, res) => {
  res.json(listExams(getDb()));
});

// POST /api/exams -> start a mock exam { question_count?, predicted_score? }
examsRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  res.status(201).json(
    createExam(getDb(), {
      question_count: body.question_count,
      predicted_score: body.predicted_score,
    }),
  );
});

// GET /api/exams/:id -> ExamSessionDetail while running, ExamResult when done
examsRouter.get('/:id', (req, res) => {
  res.json(getExam(getDb(), Number(req.params.id)));
});

// PUT /api/exams/:id/items/:position -> { selected_choice_ids?, flagged?, time_spent_ms? }
examsRouter.put('/:id/items/:position', (req, res) => {
  const body = req.body ?? {};
  res.json(
    updateExamItem(getDb(), Number(req.params.id), Number(req.params.position), {
      selected_choice_ids: body.selected_choice_ids,
      flagged: body.flagged,
      time_spent_ms: body.time_spent_ms,
    }),
  );
});

// POST /api/exams/:id/finish -> grade every item, close the session
examsRouter.post('/:id/finish', (req, res) => {
  res.json(finishExam(getDb(), Number(req.params.id)));
});
