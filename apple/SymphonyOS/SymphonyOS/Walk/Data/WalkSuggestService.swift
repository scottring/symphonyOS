#if os(iOS)
import Foundation
import Supabase

/// The walk's suggestions from the server: one call to the `walk-suggest` function as the signed-in
/// person. It sends only what `WalkSuggestRequest.body` holds. Any failure is nil, and the walk
/// shows its written examples instead.
struct WalkSuggestService: WalkSuggesting {
    private struct Reply: Decodable { let suggestions: [String]? }

    func suggest(_ request: WalkSuggestRequest) async -> [String]? {
        do {
            let reply: Reply = try await supabase.functions.invoke(
                "walk-suggest",
                options: FunctionInvokeOptions(body: request.body)
            )
            return reply.suggestions
        } catch {
            return nil
        }
    }
}
#endif
