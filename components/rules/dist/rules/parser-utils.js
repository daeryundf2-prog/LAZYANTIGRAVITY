import { RuleFrontmatterParseError } from "./errors.js";
export function stripComment(line) {
    let quote = null;
    let escaped = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === undefined)
            continue;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (quote !== null && character === "\\") {
            escaped = true;
            continue;
        }
        if (character === '"' || character === "'") {
            if (quote === null)
                quote = character;
            else if (quote === character)
                quote = null;
            continue;
        }
        if (quote === null && character === "#")
            return line.slice(0, index);
    }
    return line;
}
export function parseStringValue(value) {
    if (value.length === 0)
        return "";
    if (value.startsWith('"'))
        return parseJsonString(value);
    if (value.startsWith("'") && value.endsWith("'"))
        return value.slice(1, -1);
    if (value.startsWith("'"))
        throw new RuleFrontmatterParseError("Unclosed quoted value");
    return value;
}
export function parseJsonString(value) {
    let parsedValue;
    try {
        parsedValue = JSON.parse(value);
    }
    catch {
        throw new RuleFrontmatterParseError("Invalid JSON-quoted string");
    }
    if (typeof parsedValue !== "string") {
        throw new RuleFrontmatterParseError("Expected JSON-quoted string");
    }
    return parsedValue;
}
export function findClosingBracket(value) {
    let quote = null;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === undefined)
            continue;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (quote !== null && character === "\\") {
            escaped = true;
            continue;
        }
        if (character === '"' || character === "'") {
            if (quote === null)
                quote = character;
            else if (quote === character)
                quote = null;
            continue;
        }
        if (quote === null && character === "]")
            return index;
    }
    return -1;
}
export function splitCommaSeparated(value) {
    const values = [];
    let current = "";
    let quote = null;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === undefined)
            continue;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (quote !== null && character === "\\") {
            escaped = true;
            continue;
        }
        if (character === '"' || character === "'") {
            if (quote === null)
                quote = character;
            else if (quote === character)
                quote = null;
            continue;
        }
        if (quote === null && character === ",") {
            values.push(current.trim());
            current = "";
            continue;
        }
        current += character;
    }
    if (quote !== null) {
        throw new RuleFrontmatterParseError("Unclosed quoted value");
    }
    values.push(current.trim());
    return values.filter(Boolean);
}
