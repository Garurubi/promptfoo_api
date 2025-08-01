const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const { spawn } = require('child_process');

const app = express();
app.use(bodyParser.json());
const port = process.env.PROMPTFOO_API_PORT || 3001;
const mlflowTrackingUri = "http://192.168.2.136:15672/"

function parseEvaluationResult(stdout) {
  const startIndex = stdout.indexOf("Token Usage Summary:");
  if (startIndex === -1) return ''; // 없을 경우 빈 문자열 반환

  const summaryBlock = stdout.slice(startIndex);

  // 안전한 숫자 파싱 함수
  const safeParseInt = (match) => match ? parseInt(match[1].replace(/,/g, '')) : null;

  // Evaluation
  const evaluation = {
    total: safeParseInt(summaryBlock.match(/Evaluation:\s+Total:\s([\d,]+)/)),
    prompt: safeParseInt(summaryBlock.match(/Prompt:\s+(\d+)/)),
    completion: safeParseInt(summaryBlock.match(/Completion:\s+(\d+)/)),
    cached: safeParseInt(summaryBlock.match(/Cached:\s+([\d,]+)/))
  };

  // Providers
  const providerRegex = /Provider Breakdown:\s+([\s\S]+?)Grand Total:/;
  const providerBlock = summaryBlock.match(providerRegex)?.[1] || '';
  const providerLines = providerBlock.split('\n').map(line => line.trim()).filter(Boolean);
  const providers = [];

  for (let i = 0; i < providerLines.length; i += 2) {
    const [providerName, tokenStr] = providerLines[i].split(': ');
    const tokens = tokenStr ? parseInt(tokenStr.replace(/,/g, '')) : null;
    const cached = providerLines[i + 1]?.match(/\(([\d,]+) cached\)/);
    providers.push({
      name: providerName,
      tokens,
      cached: cached ? parseInt(cached[1].replace(/,/g, '')) : null
    });
  }

  // 기타 항목
  const durationMatch = summaryBlock.match(/Duration:\s+([^\s]+)/);
  const passRateMatch = summaryBlock.match(/Pass Rate:\s+([\d.]+)%/);
  const successMatch = summaryBlock.match(/Successes:\s+(\d+)/);
  const failureMatch = summaryBlock.match(/Failures:\s+(\d+)/);
  const errorMatch = summaryBlock.match(/Errors:\s+(\d+)/);

  return {
    evaluation,
    providers,
    duration: durationMatch?.[1] || null,
    passRate: passRateMatch ? parseFloat(passRateMatch[1]) : null,
    successes: successMatch ? parseInt(successMatch[1]) : null,
    failures: failureMatch ? parseInt(failureMatch[1]) : null,
    errors: errorMatch ? parseInt(errorMatch[1]) : null
  };
}

app.post('/evaluate', async (req, res) => {
  const { expId, runId, configFname, } = req.body;
  if (!expId || !runId || !configFname) {
    return res.status(400).json({ error: '필수 파라미터가 빠졌습니다.(expId, runId, configFname' });
  }

  try {
    // MLflow artifact URL 생성
    // 'http://192.168.2.136:15672/get-artifact?path=evaluation%2Fevaluation_table.json&run_uuid=7e680dc6b57b49e4a4e61136f8ff1adf'
    // const artifactUrl = `${mlflowTrackingUri}get-artifact?path=evaluation/${config_fname}&run_uuid=${run_id}`;
    // 임시 파일 경로 생성
    const evalPath = path.join('/mnt/mlflow_volume', expId, runId, 'artifacts', 'evaluation')
    const tempConfigPath = path.join(evalPath, configFname);

    // 파일 다운로드
    // const response = await axios.get(artifactUrl, { responseType: 'stream' });
    // const writer = fs.createWriteStream(tempConfigPath);
    // await new Promise((resolve, reject) => {
    //   response.data.pipe(writer);
    //   writer.on('finish', resolve);
    //   writer.on('error', reject);
    // });

    cli_comm = `promptfoo eval -c ${configFname}`
    // promptfoo eval 명령 실행
    exec(cli_comm, {cwd: evalPath}, (error, stdout, stderr) => {
      // 다운로드한 파일 삭제
      // fs.unlink(tempConfigPath, () => {});
      if (stdout.indexOf("Token Usage Summary") === -1) {
        return res.status(500).json({"error": error.message, "tokenUsage": null});
      }
      else {
        parsingResult = parseEvaluationResult(stdout);
        res.json({"error": null, "tokenUsage" : parsingResult});
      }
    });


    // spawn을 사용한 예시 (exec 대신)
    // const args = ['eval', '-c', tempConfigPath.trim()];
    // const child = spawn('promptfoo', args, { cwd: evalPath, shell: '/bin/sh' });

    // let stdout = '';
    // let stderr = '';

    // child.stdout.on('data', (data) => {
    //   stdout += data.toString();
    // });

    // child.stderr.on('data', (data) => {
    //   stderr += data.toString();
    // });

    // child.on('close', (code) => {
    //   if (code !== 0) {
    //     return res.status(500).json({ "error": `Process exited with code ${code}`, "stdout": stdout, "stderr": stderr });
    //   } else {
    //     const parsingResult = parseEvaluationResult(stdout);
    //     res.json(parsingResult);
    //   }
    // });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`promptfoo API 서버가 포트 ${port}에서 실행 중입니다.`);
});
