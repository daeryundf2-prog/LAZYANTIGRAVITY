---
name: duckdb-analytics
description: "DuckDB MCP를 활용한 대용량 CSV, Parquet, JSONL, 포렌식 로그(EVTX/MFT)의 0-Copy 초고속 인메모리 SQL 분석 스킬. Triggers: duckdb, 로그 쿼리, parquet 분석, csv sql, 대용량 로그 분석."
---

# DuckDB High-Performance Analytics

DuckDB의 인메모리 OLAP 쿼리 엔진 및 `duckdb` MCP를 활용하여, 수백만 건의 대용량 로그 파일(CSV, JSONL, Parquet, MFT/EVTX 덤프)을 LLM 컨텍스트 낭비 없이 0.01초 만에 인라인 SQL로 질의·집계하고 인사이트를 추출합니다.

## 핵심 도구

- **`duckdb` MCP 도구:**
  - `query(sql)`: 임의의 복잡한 SQL 쿼리 실행
  - `describe_table(table_name)`: 스키마 및 컬럼 분석

## 사용 예시

```sql
-- 1. 대용량 CSV 로그에서 특정 오류 및 타임스탬프 집계
SELECT timestamp, count(*) as err_count
FROM read_csv_auto('C:/Logs/audit_trail.csv')
WHERE level = 'ERROR'
GROUP BY timestamp
ORDER BY err_count DESC
LIMIT 10;

-- 2. Parquet 포렌식 타임라인 쿼리
SELECT event_id, computer, count(*)
FROM read_parquet('C:/Output/timeline.parquet')
GROUP BY event_id, computer;
```
