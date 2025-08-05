# 
# mlflow 라이브러리가 node에 없어서 python 스크립트로 실행
import mlflow
import argparse
import os

parser = argparse.ArgumentParser(description="Register description to an MLflow run.")
parser.add_argument("--run_id", required=True, help="MLflow run ID")
parser.add_argument("--url", required=True, help="Description URL to register")

args = parser.parse_args()

# mlflow tracking URI 설정
tracking_uri = os.environ.get("MLFLOW_TRACKING_URI", "")
mlflow.set_tracking_uri(tracking_uri)

client = mlflow.tracking.MlflowClient()
run = client.get_run(args.run_id)
description = run.data.tags.get("mlflow.note.content", "")
if "[Promptfoo]" in description:
    client.set_tag(args.run_id, "mlflow.note.content", f"{description}\n{args.url}")
else:
    client.set_tag(args.run_id, "mlflow.note.content", f"{description}\n\n[Promptfoo]\n{args.url}")