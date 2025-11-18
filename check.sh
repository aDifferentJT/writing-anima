#! /bin/sh

cd backend
uv run mypy --strict . --exclude-gitignore
uv run pylint src
cd ..

cd frontend
npx tsc --noEmit
npx eslint
cd ..
