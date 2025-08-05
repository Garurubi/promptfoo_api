const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(bodyParser.json());
const port = process.env.PROMPTFOO_API_PORT || 3001;

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
    // promptfoo 명령어 실행 디렉토리(cwd 설정)
    const evalPath = path.join('/mnt/mlflow_volume', expId, runId, 'artifacts', 'evaluation')
    const configPath = path.join(evalPath, configFname);

    // configPath의 yaml 파일에서 'description:' 부분의 텍스트를 가져오기
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const descriptionMatch = yamlContent.match(/^description:\s*(.*)$/m);
    const desp = descriptionMatch ? descriptionMatch[1].trim() : '';

    cli_comm = `promptfoo eval -c ${configFname}`
    // promptfoo eval 명령 실행
    exec(cli_comm, {cwd: evalPath}, (error, stdout, stderr) => {
      if (stdout.indexOf("Token Usage Summary") === -1) {
        return res.status(500).json({"error": error.message, "tokenUsage": null});
      }
      else {
        parsingResult = parseEvaluationResult(stdout);
        res.json({"error": null, "tokenUsage" : parsingResult});

        // description이 같은 데이터중 가장 최근의 id를 가져오기
        const dbPath = '/root/.promptfoo/promptfoo.db';
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            callback(err, null);
            return;
          }
        });

        const sql = `
          SELECT id
          FROM evals
          WHERE description = ?
          ORDER BY created_at DESC
          LIMIT 1
        `;

        db.get(sql, [desp], (err, row) => {
          // mlflow에 url 등록위한 python 스크립트 실행(mlflow 라이브러리를 사용하기 위함)
          const pythonScript = path.join(__dirname, 'register_url.py');
          const url = `${process.env.PROMPTFOO_HOST_URL}/eval/${row.id}`; // 실제 URL로 수정 필요

          const pythonProcess = spawn('python3', [
            pythonScript,
            '--run_id', runId,
            '--url', url
          ]);

          pythonProcess.stderr.on('data', (data) => {
            console.error(`register_url.py stderr: ${data}`);
          });
          pythonProcess.on('close', (code) => {
            console.log(`register_url.py process exited with code ${code}`);
          });

          db.close();
        });
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`promptfoo API 서버가 포트 ${port}에서 실행 중입니다.`);
});
