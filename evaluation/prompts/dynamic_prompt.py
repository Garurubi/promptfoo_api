def create_prompt(context):
    # 데이터마다 다른 프롬프트를 적용할 경우
    # context는 test_data에 정의된 필드를 가진다.
    cond = context['vars']
    complexity = cond.get('advanced', 'begineer')

    if complexity == 'advanced':
        return f"Provide a technical analysis of {cond['topic']}"
    else:
        return f"Explain {cond['topic']} for beginners"