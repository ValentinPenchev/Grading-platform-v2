const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Връзка със Supabase чрез променливите от средата в Render
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Настройка на multer за временно съхранение на файловете паметта
const upload = multer({ storage: multer.memoryStorage() });

// 1. Създаване на ново задание (от админ панела)
app.post('/api/assignments', async (req, res) => {
  const { title, description } = req.body;
  const { data, error } = await supabase
    .from('assignments')
    .insert([{ title, description }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

// 2. Вземане на всички задания (за админа)
app.get('/api/assignments', async (req, res) => {
  const { data, error } = await supabase.from('assignments').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 3. Вземане на конкретно задание по ID (за ученика)
app.get('/api/assignments/:id', async (req, res) => {
  const { data, error } = await supabase.from('assignments').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Заданието не е намерено' });
  res.json(data);
});

// 4. Ученическо качване на решение
app.post('/api/submit', upload.single('codeFile'), async (req, res) => {
  try {
    const { assignment_id, student_name } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Моля, прикачете файл с код.' });

    // Качване на файла в Supabase Storage (в bucket-а "student-code")
    const fileName = `${Date.now()}_${file.originalname}`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from('student-code')
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (storageError) throw storageError;

    // Взимане на публичен линк към файла
    const { data: publicUrlData } = supabase.storage.from('student-code').getPublicUrl(fileName);

    // Запис в таблицата с предадени материали
    const { data, error: dbError } = await supabase
      .from('submissions')
      .insert([{
        assignment_id,
        student_name,
        file_url: publicUrlData.publicUrl,
        grade: null,
        points: 0
      }])
      .select();

    if (dbError) throw dbError;

    res.json({ success: true, message: 'Програмата е предадена успешно!', submission: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Вземане на предадените материали за админ панела
app.get('/api/submissions', async (req, res) => {
  const { data, error } = await supabase
    .from('submissions')
    .select('*, assignments(title)')
    .order('submitted_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 6. Поставяне на оценка и точки от учителя
app.patch('/api/submissions/:id', async (req, res) => {
  const { grade, points } = req.body;
  const { data, error } = await supabase
    .from('submissions')
    .update({ grade, points })
    .eq('id', req.params.id)
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));