# DEVELOPMENT_INSTRUCTIONS.md

1. Build a frontend-only German verb-learning application with React, Vite, and TypeScript that helps users practise verb forms from the infinitive through the most important tenses, moods, participles, and imperative forms.
2. Every verb entry must include the German infinitive, English translation, present-tense conjugation, simple past, present perfect, past participle, auxiliary verb, separability, reflexive form where relevant, imperative, Konjunktiv II, and any important case or preposition requirements.
3. The settings page must let users enable or disable individual verb-form categories so practice sessions contain only the forms they currently want to learn.
4. The application should organize verbs by CEFR level, frequency, regularity, separability, auxiliary verb, reflexive usage, and common grammatical patterns.
5. Practice should combine recognition and production mechanics such as multiple choice, typed conjugation, sentence completion, matching forms, correcting mistakes, transforming sentences between tenses, and reconstructing sentences.
6. Each answer must be checked for spelling, capitalization, umlauts, ß, auxiliary choice, participle formation, pronoun agreement, and word order whenever those elements are relevant.
7. Progress must be stored locally in the browser and should track accuracy, difficult forms, frequently repeated mistakes, mastered verbs, enabled practice categories, and due reviews.
8. Use automatic spaced repetition so weak verb forms return sooner, while consistently correct forms appear less often and eventually become mastered.
9. Develop the app in phases: first create the application skeleton and verb schema, then add the exercise engine and settings, then add progress and spaced repetition, and finally import and validate the full verb dataset.
10. Keep verb content separate from interface code, use stable IDs and machine validation for every entry, and allow the AI development agents to decide the detailed component structure, styling, libraries, and implementation strategy.
