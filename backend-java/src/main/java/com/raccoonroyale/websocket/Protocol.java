package com.raccoonroyale.websocket;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class Protocol {
    private final ObjectMapper mapper;
    private final JsonSchema clientSchema;

    public Protocol(ObjectMapper mapper) throws IOException {
        this.mapper = mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
        try (var input = getClass().getResourceAsStream("/schemas/api.schema.json")) {
            if (input == null) throw new IOException("Missing shared API schema");
            var root = this.mapper.readTree(input);
            // Keep local definitions; narrow the root to inbound client messages.
            var inbound = this.mapper.createObjectNode();
            inbound.put("$schema", "https://json-schema.org/draft/2020-12/schema");
            inbound.set("$defs", root.get("$defs"));
            inbound.put("$ref", "#/$defs/ClientMessage");
            clientSchema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(inbound);
        }
    }

    public JsonNode parseClient(String text) throws IOException {
        var node = mapper.readTree(text);
        if (node == null || !clientSchema.validate(node).isEmpty()) {
            throw new IllegalArgumentException("Invalid client message");
        }
        return node;
    }

    public String message(String type, JsonNode requestId, Object payload) throws IOException {
        var envelope = mapper.createObjectNode();
        envelope.put("protocolVersion", 1);
        envelope.put("type", type);
        if (requestId == null) envelope.putNull("requestId");
        else envelope.set("requestId", requestId);
        envelope.set("payload", mapper.valueToTree(payload));
        return mapper.writeValueAsString(envelope);
    }

    public String error(String code, JsonNode requestId) throws IOException {
        return error(code, requestId, "Message does not match protocol v1.");
    }

    public String error(String code, JsonNode requestId, String detail) throws IOException {
        return message("ERROR", requestId, Map.of("code", code, "message", detail));
    }
}
