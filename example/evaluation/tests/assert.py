try:
    import openai
except ImportError:
    import subprocesss
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openai", "--break-system-packages"])
    import openai

evaluation_system_prompt = \
"""
You are an evaluator that compares the ground truth entities with the predicted entities. Each entity belongs to a specific type: social_issue, solution, affected group, and affected region.
Your task is to count how many predicted entities are semantically correct compared to the ground truth, considering the type of each entity.
Do not require exact string matches. Use meaning-based comparison.
If a predicted entity is a more specific or broader expression than the ground truth, but their core meaning overlaps, consider it a correct match.
Only output the total number of semantically correct predicted entities.

For example:
"spam call and voice phishing" and "voice phishing" should be considered a correct match.
"modern people" and "people" may also be considered a match if they share the same implied group.
"""

evaluation_prompt = \
"""
### Ground Truth
{ground_truth}

### Model Prediction
{predictions}
"""

def get_assert(output, context):
    entity_cnt = context['vars']['entity_cnt']

    eval_input = evaluation_prompt.format(
        ground_truth=ground_truth,
        predictions=predictions
    )
    client = openai.Client(api_key="EMPTY", base_url="http://192.168.2.104:8401/v1")
    response = client.chat.completions.create(
            model="Qwen/Qwen2.5-7B-Instruct",
            messages=[{"role": "system", "content": evaluation_system_prompt},
                {"role": "user", "content": eval_input}],
            max_tokens=10,
            temperature=0.0
    )
    evaluate_result = response.choices[0].message.content.strip()
    try:
        if entity_cnt == 0:
            score = 1 if evaluate_result == 0 else 0
            reason = "성공 : 엔티티 수치가 0인 경우 예측 결과도 0임을 예측함."
        elif int(evaluate_result) > entity_cnt:
            score = 2
            reason = "에러 : 예측 결과 수치가 실제 엔티티 수치보다 많습니다."     
        else :
            score = int(evaluate_result) / entity_cnt
    except ValueError:
        score = 2
        reason = "에러 : 예측 결과가 숫자가 아닙니다."
    except Exception as e:
        score = 2
        reason = f"에러 : 예측 결과 처리 중 오류 발생 - {str(e)}"

    return {
        'pass': score >= 0.5,
        'score': score,
        'reason': reason 
    }