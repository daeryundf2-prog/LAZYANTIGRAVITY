# Data Bias Mitigation & Data Analysis QA Rules

To prevent models from hallucinating statistical insights, summarizing data blindly, or propagating underlying biases, all data analysis tasks must be verified programmatically against strict data quality and representation rules.

---

## 1-10 Scoring Rubric for Data Analysis Tasks

| Score Range | Tier | Criteria |
| :--- | :--- | :--- |
| **8 - 10** | **Premium / Excellent** | - **Programmatic Cross-Verification**: Every single statistical claim (mean, median, count, percentage) is derived via audited, executed code (e.g., Pandas, R, SQL) and cross-verified against raw data shape.<br>- **Systematic Bias Checking**: Dataset representation is analyzed (class imbalance, geographical bias, demographic skew, temporal drift) and reported.<br>- **Outlier & Distribution Audits**: Programmatic outlier checks (IQR, Z-score) and distribution checks (Shapiro-Wilk, Kolmogorov-Smirnov) are conducted.<br>- **Zero-Hallucination**: No speculative insights or undocumented trends are presented. |
| **5 - 7** | **Moderate / Standard** | - **Basic Code Execution**: Descriptive statistics are calculated using code, but missing comprehensive cross-verification.<br>- **Passive Bias Mention**: Potential data skews are noted qualitatively, but not measured statistically.<br>- **Rudimentary Outlier Handling**: Simple min/max checks are done, but no formal outlier detection or distribution verification.<br>- **Low Speculation**: Insights are generally grounded, but minor assumptions or unverified patterns are present. |
| **1 - 4** | **Basic / Low** | - **Text-Only Summarization**: The model summarizes data based on text previews or prompts without executing code.<br>- **Unmitigated Bias**: Class imbalance, feature skew, or target leakage is ignored, leading to biased analysis.<br>- **No Outlier Handling**: Outliers are ignored or treated as standard data points, distorting statistical aggregates.<br>- **High Hallucination**: Model invents correlations, trends, or numbers not present in the dataset. |

---

## Technical Verification Checklist

To achieve a score of **8 - 10**, the analysis must implement and verify the following checks:

### 1. Data Representativeness & Imbalance Audit
- **Check**: Run frequency counts on categorical features, target labels, and demographic columns (if applicable).
- **Metric**: Calculate the Shannon entropy or Simpson's index to measure diversity. Report minority classes representing $< 10\%$ of samples.
- **Action**: For predictive tasks, assert that training/evaluation splits preserve class ratios (Stratified K-Fold).

### 2. Outlier Detection & Treatment
- **Check**: Calculate the Interquartile Range (IQR) for numeric variables:
  $$\text{IQR} = Q_3 - Q_1$$
  Identify anomalies beyond:
  $$[Q_1 - 1.5 \times \text{IQR}, \ Q_3 + 1.5 \times \text{IQR}]$$
- **Action**: Run the analysis with and without outliers to demonstrate how anomalies skew overall metrics (e.g., how the mean shifts compared to the median).

### 3. Missing Data & Leakage Analysis
- **Check**: Programmatically verify missing percentage per column:
  $$\text{Missing \%} = \frac{\text{Null Count}}{\text{Total Rows}} \times 100$$
- **Action**: Do not use simple mean/median imputation without verifying if data is Missing Completely at Random (MCAR) or Missing at Random (MAR). Flag potential target leakage (features containing information from the target variable).

### 4. Correlation vs. Causation Integrity
- **Check**: Calculate correlation matrices (Pearson for linear, Spearman for non-monotonic relationship).
- **Rule**: Never assert causal links purely based on correlation coefficients. Cross-reference with temporal ordering (A must precede B to cause B).
