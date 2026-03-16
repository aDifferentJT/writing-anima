#! /bin/sh

cd backend
uv run mypy --strict .
uv run pylint src
cd ..

cd frontend
npx tsc --noEmit
npx eslint
cd ..
