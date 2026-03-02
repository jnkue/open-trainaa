
## Run the development server

````
uv run python3 -m uvicorn api.main:app --reload --reload-dir api --host 0.0.0.0 --port 8000 --log-config logging_config.yaml
`````
