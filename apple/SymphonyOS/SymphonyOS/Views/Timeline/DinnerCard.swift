import SwiftUI

/// The night's planned dinner on Today: photo, dish, how long it takes, and
/// the one cue from its notes. Tapping opens the recipe — in the app when the
/// plan holds one, otherwise its source page.
struct DinnerCard: View {
    let dinner: Dinner
    @State private var showRecipe = false
    @State private var safariURL: URL?

    var body: some View {
        Button(action: open) {
            HStack(alignment: .top, spacing: 12) {
                photo
                VStack(alignment: .leading, spacing: 3) {
                    Text(dinner.title)
                        .font(.bodyMediumBold)
                        .foregroundStyle(Color.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let minutes = dinner.prepMinutes {
                        Label("\(minutes) min", systemImage: "clock")
                            .font(.bodySmall)
                            .foregroundStyle(Color.textSecondary)
                    }
                    if let cue = dinner.cue {
                        Text(cue)
                            .font(.bodySmall)
                            .foregroundStyle(Color.textTertiary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if dinner.hasRecipe || dinner.sourceURL != nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.textTertiary)
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
            .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!dinner.hasRecipe && dinner.sourceURL == nil)
        .accessibilityHint(dinner.hasRecipe || dinner.sourceURL != nil ? "Opens the recipe" : "")
        .sheet(isPresented: $showRecipe) {
            DinnerRecipeSheet(dinner: dinner)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $safariURL) { url in SafariView(url: url) }
    }

    @ViewBuilder
    private var photo: some View {
        if let url = dinner.imageURL {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.bgSurface
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityHidden(true)
        } else {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.bgSurface)
                .frame(width: 64, height: 64)
                .overlay(
                    Image(systemName: "fork.knife")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.textTertiary)
                )
                .accessibilityHidden(true)
        }
    }

    private func open() {
        if dinner.hasRecipe { showRecipe = true } else if let url = dinner.sourceURL { safariURL = url }
    }
}

/// The recipe, to cook from: photo, ingredients, steps, and the original page.
struct DinnerRecipeSheet: View {
    let dinner: Dinner
    @State private var safariURL: URL?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let url = dinner.imageURL {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.bgSurface
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 220)
                    .clipped()
                    .accessibilityHidden(true)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(dinner.title)
                        .font(.displayMedium)
                        .foregroundStyle(Color.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let minutes = dinner.prepMinutes {
                        Label("\(minutes) min", systemImage: "clock")
                            .font(.bodySmall)
                            .foregroundStyle(Color.textSecondary)
                    }
                    if let notes = dinner.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.bodySmall)
                            .foregroundStyle(Color.textSecondary)
                            .padding(.top, 6)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)

                if !dinner.ingredients.isEmpty {
                    Eyebrow(text: "Ingredients")
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(dinner.ingredients.enumerated()), id: \.offset) { _, line in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Circle().fill(Color.textLight).frame(width: 5, height: 5)
                                Text(line)
                                    .font(.bodyMedium)
                                    .foregroundStyle(Color.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }

                if !dinner.instructions.isEmpty {
                    Eyebrow(text: "Steps")
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(dinner.instructions.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text("\(index + 1)")
                                    .font(.bodySmallBold)
                                    .foregroundStyle(Color.textTertiary)
                                    .frame(minWidth: 16, alignment: .trailing)
                                Text(step)
                                    .font(.bodyMedium)
                                    .foregroundStyle(Color.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }

                if let url = dinner.sourceURL {
                    Button { safariURL = url } label: {
                        Label("Open original", systemImage: "safari")
                    }
                    .buttonStyle(.symphonySecondary)
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                }
            }
            .padding(.bottom, 32)
        }
        .background(Color.bgBase.ignoresSafeArea())
        .sheet(item: $safariURL) { url in SafariView(url: url) }
    }
}
