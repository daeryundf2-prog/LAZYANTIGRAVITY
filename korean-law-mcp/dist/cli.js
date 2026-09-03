#!/usr/bin/env node
/**
 * Korean Law & Statute Grounding MCP Server
 * Prevents Korean legal and statute hallucination (e.g. fabricated articles, fake precedent numbers).
 */
import { createInterface } from "node:readline";

const STATUTE_DATABASE = {
	"민법": {
		"1": "제1조 (법원) 민사에 관하여 법률에 규정이 없으면 관습법에 의하고 관습법이 없으면 조리에 의한다.",
		"2": "제2조 (신의성실) ① 권리의 행사와 의무의 이행은 신의에 좇아 성실히 하여야 한다. ② 권리는 남용하지 못한다.",
		"103": "제103조 (반사회질서의 법률행위) 선량한 풍속 기타 사회질서에 위반한 사항을 내용으로 하는 법률행위는 무효로 한다.",
		"104": "제104조 (불공정한 법률행위) 당사자의 궁박, 경솔 또는 무경험으로 인하여 현저하게 공정을 잃은 법률행위는 무효로 한다.",
		"110": "제110조 (사기, 강박에 의한 의사표시) ① 사기나 강박에 의한 의사표시는 취소할 수 있다.",
		"390": "제390조 (채무불이행과 손해배상) 채무자가 채무의 내용에 좇은 이행을 하지 아니한 때에는 채권자는 손해배상을 청구할 수 있다. 그러나 채무자의 고의나 과실없이 이행할 수 없게 된 때에는 그러하지 아니하다.",
		"750": "제750조 (불법행위의 내용) 고의 또는 과실로 인한 위법행위로 타인에게 손해를 가한 자는 그 손해를 배상할 책임이 있다.",
		"751": "제751조 (재산 이외의 손해의 배상) ① 타인의 신체, 자유 또는 명예를 해하거나 기타 정신상고통을 가한 자는 재산 이외의 손해에 대하여도 배상할 책임이 있다."
	},
	"형법": {
		"1": "제1조 (범죄의 성립과 처벌) ① 범죄의 성립과 처벌은 행위시의 법률에 따른다.",
		"20": "제20조 (정당행위) 법령에 의한 행위 또는 업무로 인한 행위 기타 사회상규에 위배되지 아니하는 행위는 벌하지 아니한다.",
		"21": "제21조 (정당방위) ① 현재의 부당한 침해로부터 자기 또는 타인의 법익을 방위하기 위하여 한 행위는 상당한 이유가 있는 때에는 벌하지 아니한다.",
		"30": "제30조 (공동정범) 2인 이상이 공동하여 죄를 범한 때에는 각자를 그 죄의 정범으로 처벌한다.",
		"307": "제307조 (명예훼손) ① 공연히 사실을 적시하여 사람의 명예를 훼손한 자는 2년 이하의 징역이나 금고 또는 500만원 이하의 벌금에 처한다. ② 공연히 허위의 사실을 적시하여 사람의 명예를 훼손한 자는 5년 이하의 징역, 10년 이하의 자격정지 또는 1천만원 이하의 벌금에 처한다.",
		"314": "제314조 (업무방해) ① 제313조의 방법 또는 위력으로써 사람의 업무를 방해한 자는 5년 이하의 징역 또는 1천500만원 이하의 벌금에 처한다.",
		"316": "제316조 (비밀침해) ① 봉함 기타 비밀장치한 사람의 편지, 문서 또는 도화를 개봉한 자는 3년 이하의 징역이나 금고 또는 500만원 이하의 벌금에 처한다.",
		"347": "제347조 (사기) ① 사람을 기망하여 재물의 교부를 받거나 재산상의 이익을 취득한 자는 10년 이하의 징역 또는 2천만원 이하의 벌금에 처한다.",
		"355": "제355조 (횡령, 배임) ① 타인의 재물을 보관하는 자가 그 재물을 횡령하거나 그 반환을 거부한 때에는 5년 이하의 징역 또는 1천500만원 이하의 벌금에 처한다. ② 타인의 사무를 처리하는 자가 그 임무에 위배하는 행위로써 재산상의 이익을 취득하거나 제삼자로 하여금 이를 취득하게 하여 본인에게 손해를 가한 때에도 전항의 형과 같다."
	},
	"개인정보보호법": {
		"15": "제15조 (개인정보의 수집·이용) ① 개인정보처리자는 다음 각 호의 어느 하나에 해당하는 경우에는 개인정보를 수집할 수 있으며 그 수집 목적의 범위에서 이용할 수 있다: 1. 정보주체의 동의를 받은 경우 2. 법률에 특별한 규정이 있거나 법령상 의무를 준수하기 위하여 불가피한 경우 등.",
		"17": "제17조 (개인정보의 제공) ① 개인정보처리자는 정보주체의 동의를 받거나 제15조제1항 각 호에 해당하는 경우 개인정보를 제3자에게 제공할 수 있다.",
		"18": "제18조 (개인정보의 목적 외 이용·제공 제한) ① 개인정보처리자는 개인정보를 제15조제1항에 따른 범위를 초과하여 이용하거나 제17조제1항 및 제3항에 따른 범위를 초과하여 제3자에게 제공하여서는 아니 된다.",
		"23": "제23조 (민감정보의 처리 제한) ① 개인정보처리자는 사상·신념, 노동조합·정당의 가입·탈퇴, 정치적 견해, 건강, 성생활 등에 관한 정보 등을 처리하여서는 아니 된다. (별도 동의 또는 법령 근거 예외)",
		"29": "제29조 (안전조치의무) 개인정보처리자는 개인정보가 분실·도난·유출·위조·변조 또는 훼손되지 아니하도록 내부관리계획 수립, 접속기록 보관 등 대통령령으로 정하는 바에 따라 안전성 확보에 필요한 기술적·관리적 및 물리적 조치를 하여야 한다.",
		"71": "제71조 (벌칙) 다음 각 호의 어느 하나에 해당하는 자는 5년 이하의 징역 또는 5천만원 이하의 벌금에 처한다."
	},
	"정보통신망법": {
		"44": "제44조의7 (불법정보의 유통금지 등) ① 누구든지 정보통신망을 통하여 음란정보, 명예훼손 정보, 공포심·불안감 유발 문언, 해킹 프로그램 등 불법정보를 유통하여서는 아니 된다.",
		"44-7": "제44조의7 (불법정보의 유통금지 등) ① 누구든지 정보통신망을 통하여 음란정보, 명예훼손 정보, 공포심·불안감 유발 문언, 해킹 프로그램 등 불법정보를 유통하여서는 아니 된다.",
		"48": "제48조 (정보통신망 침해행위 등의 금지) ① 누구든지 정당한 접근권한 없이 또는 허용된 접근권한을 넘어 정보통신망에 침입하여서는 아니 된다. ② 누구든지 악성프로그램을 전달 또는 유포하여서는 아니 된다.",
		"49": "제49조 (비밀 등의 보호) 누구든지 정보통신망에 의하여 처리·보관 또는 전송되는 타인의 정보를 훼손하거나 타인의 비밀을 침해·도용 또는 누설하여서는 아니 된다.",
		"70": "제70조 (벌칙) ① 사람을 비방할 목적으로 정보통신망을 통하여 공공연하게 사실을 드러내어 다른 사람의 명예를 훼손한 자는 3년 이하의 징역 또는 3천만원 이하의 벌금에 처한다. ② 사람을 비방할 목적으로 정보통신망을 통하여 공공연하게 거짓의 사실을 드러내어 다른 사람의 명예를 훼손한 자는 7년 이하의 징역, 10년 이하의 자격정지 또는 5천만원 이하의 벌금에 처한다."
	},
	"전자문서법": {
		"4": "제4조 (전자문서의 효력) ① 전자문서는 전자적 형태로 되어 있다는 이유만으로 법적 효력이 부인되지 아니한다.",
		"4-2": "제4조의2 (전자화문서의 효력) 공인전자문서센터 등 법정 요건을 갖추어 종이문서를 전자화한 전자화문서는 원본 문서와 동일한 효력을 갖는다."
	},
	"부정경쟁방지법": {
		"2": "제2조 (정의) 2. \"영업비밀\"이란 공공연히 알려져 있지 아니하고 독립된 경제적 가치를 가지는 것으로서, 비밀로 관리된 생산방법, 판매방법, 그 밖에 영업활동에 유용한 기술상 또는 경영상의 정보를 말한다.",
		"18": "제18조 (벌칙) ① 국내 또는 국외에서 사용할 목적으로 부정한 방법으로 영업비밀을 취득·사용하거나 제삼자에게 누설한 자는 10년 이하의 징역 또는 5억원 이하의 벌금에 처한다."
	}
};

const LANDMARK_PRECEDENTS = {
	"2017다220744": {
		court: "대법원",
		case_number: "2017다220744",
		date: "2021. 5. 7.",
		name: "위약벌 및 손해배상액 예정 사건",
		holding: "채무불이행으로 인한 손해배상액의 예정과 위약벌의 구별 기준 및 감액 가부."
	},
	"2018도13792": {
		court: "대법원",
		case_number: "2018도13792",
		date: "2020. 8. 27.",
		name: "정보통신망법 위반(비밀침해) 전원합의체 판결",
		holding: "정보통신망에 의하여 처리·보관 또는 전송되는 타인의 비밀을 침해·도용하는 행위의 성립 요건."
	},
	"2011도10797": {
		court: "대법원",
		case_number: "2011도10797",
		date: "2013. 2. 15.",
		name: "전자증거 무결성 및 해시 동일성 증명 원칙 판결",
		holding: "압수물인 디지털 저장매체로부터 출력된 문건의 증거능력을 인정하기 위해서는 매체 원본과 출력 문건 간의 동일성과 무결성(해시값 일치)이 입증되어야 한다."
	},
	"2021도11170": {
		court: "대법원",
		case_number: "2021도11170",
		date: "2021. 11. 18.",
		name: "전자정보 압수수색 참여권 및 무관정보 탐색 제한 전원합의체 판결",
		holding: "전자정보 압수수색 시 피의자 참여권 보장, 혐의사실 무관 정보의 즉시 삭제·폐기 또는 반환 의무 및 위반 시 증거능력 배제."
	}
};

function textResult(payload, isError = false) {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		...(isError ? { isError: true } : {})
	};
}

function normalizeStatuteName(name) {
	const n = name.replace(/\s+/g, "");
	if (n.includes("민법")) return "민법";
	if (n.includes("형법")) return "형법";
	if (n.includes("개인정보") || n.includes("PII")) return "개인정보보호법";
	if (n.includes("정보통신망") || n.includes("망법")) return "정보통신망법";
	if (n.includes("전자문서")) return "전자문서법";
	if (n.includes("부정경쟁") || n.includes("영업비밀")) return "부정경쟁방지법";
	return name.trim();
}

function normalizeArticleNumber(raw) {
	if (!raw) return "";
	return String(raw)
		.trim()
		.replace(/^제\s*/, "")
		.replace(/\s*조(?:의|\s*-\s*)?/g, "-")
		.replace(/[^0-9-]/g, "")
		.replace(/^-+|-+$/g, "");
}

async function lookupStatute(args) {
	const rawName = typeof args.statute_name === "string" ? args.statute_name.trim() : "";
	if (!rawName) {
		return textResult({ ok: false, error: "statute_name is required" }, true);
	}
	const statuteKey = normalizeStatuteName(rawName);
	const statuteData = STATUTE_DATABASE[statuteKey];

	if (!statuteData) {
		return textResult({
			ok: false,
			statute_name: rawName,
			error: `[INSUFFICIENT_DATA: 법령 '${rawName}' 미수록] 해당 법령의 조문은 파라메트릭 메모리로 추측하여 날조하지 말고 공식 국가법령정보센터(law.go.kr)를 확인하십시오.`,
			grounding_status: "UNVERIFIED"
		}, true);
	}

	const articleNum = args.article_number ? normalizeArticleNumber(args.article_number) : "";
	if (articleNum) {
		let article = statuteData[articleNum];
		let resolvedNum = articleNum;
		if (!article) {
			const foundEntry = Object.entries(statuteData).find(([key, text]) => {
				if (key === articleNum || key.replace(/-/g, "") === articleNum.replace(/-/g, "")) return true;
				const cleanText = text.replace(/\s+/g, "");
				return cleanText.includes(`제${articleNum}조`) || cleanText.includes(`제${articleNum.replace('-', '조의')}`);
			});
			if (foundEntry) {
				resolvedNum = foundEntry[0];
				article = foundEntry[1];
			}
		}

		if (article) {
			return textResult({
				ok: true,
				statute_name: statuteKey,
				article_number: resolvedNum,
				text: article,
				grounding_status: "VERIFIED_PRIMARY_STATUTE"
			});
		} else {
			return textResult({
				ok: false,
				statute_name: statuteKey,
				article_number: articleNum,
				error: `[INSUFFICIENT_DATA: ${statuteKey} 제${articleNum}조 미확인] 존재하지 않거나 데이터베이스에 미수록된 조문입니다. 추측 인용 금지.`,
				grounding_status: "UNVERIFIED"
			}, true);
		}
	}

	// Keyword search within statute
	const keyword = typeof args.keyword === "string" ? args.keyword.trim() : "";
	if (keyword) {
		const matched = Object.entries(statuteData)
			.filter(([_, content]) => content.includes(keyword))
			.map(([num, content]) => ({ article_number: num, text: content }));
		return textResult({
			ok: true,
			statute_name: statuteKey,
			query_keyword: keyword,
			match_count: matched.length,
			matches: matched,
			grounding_status: "VERIFIED_PRIMARY_STATUTE"
		});
	}

	// Return all articles in database for this statute
	return textResult({
		ok: true,
		statute_name: statuteKey,
		total_provisions: Object.keys(statuteData).length,
		articles: statuteData,
		grounding_status: "VERIFIED_PRIMARY_STATUTE"
	});
}

async function lookupPrecedent(args) {
	const rawCase = typeof args.case_number === "string" ? args.case_number.trim() : "";
	const keyword = typeof args.keyword === "string" ? args.keyword.trim() : "";

	if (!rawCase && !keyword) {
		return textResult({ ok: false, error: "Either case_number or keyword must be provided" }, true);
	}

	// Validate Korean precedent case number pattern: e.g. 2023다12345, 2020도1234
	const CASE_NO_RE = /(\d{4})\s*([가-힣]{1,3})\s*(\d+)/;
	let parsedCase = null;
	if (rawCase) {
		const match = rawCase.match(CASE_NO_RE);
		if (match) {
			parsedCase = {
				year: match[1],
				court_code: match[2],
				serial: match[3],
				canonical_number: `${match[1]}${match[2]}${match[3]}`
			};
		}
	}

	if (parsedCase && LANDMARK_PRECEDENTS[parsedCase.canonical_number]) {
		const precedent = LANDMARK_PRECEDENTS[parsedCase.canonical_number];
		return textResult({
			ok: true,
			case_number: parsedCase.canonical_number,
			format_valid: true,
			precedent,
			grounding_status: "VERIFIED_PRIMARY_PRECEDENT"
		});
	}

	if (parsedCase) {
		return textResult({
			ok: true,
			case_number: parsedCase.canonical_number,
			format_valid: true,
			court_code_info: {
				code: parsedCase.court_code,
				jurisdiction: parsedCase.court_code === "다" ? "대법원 민사상고" : parsedCase.court_code === "도" ? "대법원 형사상고" : "법원 판결"
			},
			warning: "판례 번호 형식은 유효하나 전문 인용 시 공식 대법원 종합법률정보(glaw.scourt.go.kr) 원문 확인 필수. 존재하지 않는 가짜 판시사항 날조 금지.",
			grounding_status: "FORMAT_VERIFIED_CONTENT_REQUIRES_SOURCE"
		});
	}

	return textResult({
		ok: false,
		query: rawCase || keyword,
		error: `[INSUFFICIENT_DATA] 유효한 대한민국 대법원 판례 번호 형식(예: 2023다12345)을 파싱할 수 없습니다.`,
		grounding_status: "INVALID_PRECEDENT_FORMAT"
	}, true);
}

const TOOLS = [
	{
		name: "lookup_statute",
		description: "Retrieve accurate Korean statutory provisions (민법, 형법, 정보통신망법, 개인정보보호법, 전자문서법 등) to eliminate statute article hallucination.",
		inputSchema: {
			type: "object",
			properties: {
				statute_name: { type: "string", description: "Name of the Korean statute (e.g. '민법', '개인정보보호법', '정보통신망법')" },
				article_number: { type: "string", description: "Article number (e.g. '103', '750', '48')" },
				keyword: { type: "string", description: "Keyword to search within statute provisions" }
			},
			required: ["statute_name"]
		}
	},
	{
		name: "lookup_precedent",
		description: "Validate Korean judicial precedent case numbers (e.g. 202X다XXXXX) and lookup verified Supreme Court precedent holdings.",
		inputSchema: {
			type: "object",
			properties: {
				case_number: { type: "string", description: "Precedent case number (e.g. '2017다220744', '2018도13792')" },
				keyword: { type: "string", description: "Keyword to search precedents" }
			}
		}
	}
];

const TOOL_HANDLERS = {
	lookup_statute: lookupStatute,
	lookup_precedent: lookupPrecedent
};

async function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return null;
	const { id, method, params } = message;
	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "korean-law-mcp", version: "0.1.0" }
			}
		};
	}
	if (method === "notifications/initialized") return null;
	if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
	if (method === "tools/call") {
		const name = params?.name;
		const handler = TOOL_HANDLERS[name];
		if (!handler) {
			return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unsupported tool: ${name}` } };
		}
		const result = await handler(params?.arguments ?? {});
		return { jsonrpc: "2.0", id, result };
	}
	return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

async function main() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	for await (const line of rl) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const request = JSON.parse(trimmed);
			const response = await handleJsonRpc(request);
			if (response) {
				process.stdout.write(`${JSON.stringify(response)}\n`);
			}
		} catch (err) {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
		}
	}
}

main().catch((err) => {
	process.stderr.write(`[korean-law-mcp] Fatal error: ${err.message}\n`);
	process.exit(1);
});
