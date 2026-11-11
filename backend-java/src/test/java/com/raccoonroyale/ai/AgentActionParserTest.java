package com.raccoonroyale.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.raccoonroyale.ai.AgentActionParser.InvalidAgentOutput;
import com.raccoonroyale.websocket.Protocol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AgentActionParserTest {
    AgentActionParser parser;
    @BeforeEach void setup() throws Exception { parser = new AgentActionParser(new Protocol(new ObjectMapper())); }

    static String reply(String action, String bid, String price, String message) {
        return "{\"action\":\"" + action + "\",\"bid\":" + bid + ",\"proposedPrice\":\"" + price + "\",\"message\":\"" + message + "\",\"agreementId\":null}";
    }

    @Test void acceptsSchemaValidMovesEvenWrappedInProseOrFences() {
        var bid = parser.parse(reply("BID", "{\"quantity\":3,\"face\":5}", "0", "Three fives, kid."), AgentActionParser.TURN_ACTIONS);
        assertEquals(new AgentContext.Bid(3, 5), bid.bid());
        assertEquals("Three fives, kid.", bid.message());
        var fenced = parser.parse("Sure!\n```json\n" + reply("CALL_BLUFF", "null", "0", "Liar {you}!") + "\n```", AgentActionParser.TURN_ACTIONS);
        assertEquals("CALL_BLUFF", fenced.action());
        assertEquals("Liar {you}!", fenced.message()); // Braces inside strings do not end the object.
        assertEquals("CHAT", parser.parse(reply("CHAT", "null", "0", "Hi"), AgentActionParser.CHAT_ACTIONS).action());
    }

    @Test void rejectsUnknownFieldsMissingFieldsAndMalformedReplies() {
        String smuggled = "{\"action\":\"BID\",\"bid\":{\"quantity\":1,\"face\":2},\"proposedPrice\":\"0\",\"message\":\"\",\"agreementId\":null,\"tool\":\"transfer_all\"}";
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(smuggled, AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse("{\"action\":\"CALL_BLUFF\"}", AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse("I call bluff!", AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse("", AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse("{\"action\":\"BID\"", AgentActionParser.TURN_ACTIONS));
        String duplicate = "{\"action\":\"CHAT\",\"action\":\"TIP\",\"bid\":null,\"proposedPrice\":\"0\",\"message\":\"x\",\"agreementId\":null}";
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(duplicate, AgentActionParser.CHAT_ACTIONS));
    }

    @Test void rejectsActionsOutsideTheTaskImpossibleBidsAndAnyTokenAmount() {
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("TIP", "null", "0", "here"), AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("BID", "{\"quantity\":2,\"face\":3}", "0", "x"), AgentActionParser.CHAT_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("BID", "{\"quantity\":99,\"face\":6}", "0", ""), AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("BID", "{\"quantity\":2,\"face\":7}", "0", ""), AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("BID", "null", "0", ""), AgentActionParser.TURN_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("CHAT", "null", "1000000000000000000000000", "pay"), AgentActionParser.CHAT_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("CHAT", "null", "-1", "pay"), AgentActionParser.CHAT_ACTIONS));
        assertThrows(InvalidAgentOutput.class, () -> parser.parse(reply("CHAT", "null", "0", " "), AgentActionParser.CHAT_ACTIONS));
    }

    @Test void longTableTalkIsTruncated() {
        var proposal = parser.parse(reply("CALL_BLUFF", "null", "0", "a".repeat(450)), AgentActionParser.TURN_ACTIONS);
        assertEquals(AgentActionParser.MAX_MESSAGE, proposal.message().length());
    }
}
