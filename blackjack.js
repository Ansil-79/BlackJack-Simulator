class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
        // unique instance id so identical rank+suit from different decks
        // are treated as separate physical cards
        if (typeof Card._nextId === 'undefined') Card._nextId = 1;
        this.id = Card._nextId++;
    }

    getValue() {
        if (['J', 'Q', 'K'].includes(this.rank)) return 10;
        if (this.rank === 'A') return 11;
        return parseInt(this.rank);
    }

    toString() {
        return `${this.rank}${this.suit}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        const suits = ['♠', '♣', '♥', '♦'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        for (let suit of suits) {
            for (let rank of ranks) {
                this.cards.push(new Card(suit, rank));
            }
        }
    }
}

class Shoe {
    constructor(numberOfDecks) {
        this.cards = [];
        this.discardPile = [];
        this.numberOfDecks = numberOfDecks;
        this.onEndOfShoe = null; // optional callback when shoe is fully dealt
        this._endAlerted = false;
        this.initializeShoe();
    }

    // Start tracking dealt cards for a new round (prevents duplicates within a round)
    startRound() {
        this.currentRoundDealt = new Set();
    }

    // End the round and clear tracking
    endRound() {
        this.currentRoundDealt = null;
    }

    initializeShoe() {
        this.cards = [];
        for (let i = 0; i < this.numberOfDecks; i++) {
            const deck = new Deck();
            this.cards.push(...deck.cards);
        }
        this.shuffle();
        // reset end-of-shoe alert state when a fresh shoe is prepared
        this._endAlerted = false;
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        if (this.cards.length === 0) {
            if (this.discardPile.length === 0) {
                this.initializeShoe();
            } else {
                this.cards = [...this.discardPile];
                this.discardPile = [];
                this.shuffle();
            }
        }
    // Try to avoid dealing a card with the same rank+suit that was
        // already dealt earlier in the same round. If this.currentRoundDealt is
        // not set, behave normally. We add a safe attempt limit to avoid an
        // infinite loop in degenerate cases.
        const maxAttempts = Math.max(10, this.cards.length + 5);
        let attempts = 0;
        // snapshot how many cards are available at the start of this deal()
        // call so we can detect when the last card of the shoe is consumed.
        const initialAvailable = this.cards.length;
        while (this.cards.length > 0 && attempts < maxAttempts) {
            attempts++;
            const card = this.cards.pop();
            if (!this.currentRoundDealt) {
                return card;
            }
            const id = card.id;
            if (!this.currentRoundDealt.has(id)) {
                this.currentRoundDealt.add(id);
                return card;
            }
            // Duplicate found for this round: move it to discard pile for now
            // and continue searching for a non-duplicate. This reduces the
            // chance of seeing the same rank+suit within a round.
        this.discardPile.push(card);
        }

        // Fallback: if we couldn't find a unique card within attempts, just
        // return whatever is next (last popped or reinitialize and pop).
        if (this.cards.length === 0) {
            if (this.discardPile.length > 0) {
                this.cards = [...this.discardPile];
                this.discardPile = [];
                this.shuffle();
            } else {
                this.initializeShoe();
            }
        }
        const fallback = this.cards.pop();
        if (this.currentRoundDealt && fallback) this.currentRoundDealt.add(fallback.id);

        // If initialAvailable was 1, this call just consumed the last card of
        // the shoe. Fire the onEndOfShoe callback once (guarded by _endAlerted).
        if (initialAvailable === 1 && !this._endAlerted) {
            this._endAlerted = true;
            if (typeof this.onEndOfShoe === 'function') {
                try { this.onEndOfShoe(); } catch (e) { console.error('onEndOfShoe callback error', e); }
            } else {
                // default behavior: console log and browser alert so user notices
                console.log('End of shoe: all cards from the configured shoe have been dealt.');
                try { if (typeof window !== 'undefined' && window.alert) window.alert('End of shoe: all cards have been dealt.'); } catch (e) {}
            }
        }

        return fallback;
    }

    addToDiscardPile(cards) {
        if (Array.isArray(cards)) {
            this.discardPile.push(...cards);
        } else {
            this.discardPile.push(cards);
        }
    }
}

class Hand {
    constructor() {
        this.cards = [];
        this.bet = 0;
        this.hasStood = false;
        this.hasSurrendered = false;
        this.isSplit = false; // mark hands created by a split
    }

    addCard(card) {
        this.cards.push(card);
    }

    getScore() {
        let score = 0;
        let aces = 0;

        for (let card of this.cards) {
            if (card.rank === 'A') {
                aces++;
                score += 11;
            } else {
                score += card.getValue();
            }
        }

        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }

        return score;
    }

    isBusted() {
        return this.getScore() > 21;
    }

    isBlackjack() {
        return this.cards.length === 2 && this.getScore() === 21;
    }
}

class Blackjack {
    constructor(numberOfDecks = 6, standOnSoft17 = true, allowSurrender = true, startingChips = 1000) {
        this.shoe = new Shoe(numberOfDecks);
        this.standOnSoft17 = standOnSoft17; // true for S17, false for H17
        this.allowSurrender = allowSurrender;
        this.dealerHand = new Hand();
        this.playerHands = [new Hand()];
        this.currentHandIndex = 0;
        this.numberOfDecks = numberOfDecks;
        this.chips = startingChips;
    }

    dealInitialCards() {
        // mark the start of a new round so the shoe can avoid duplicate
        // rank+suit cards within this round
        if (this.shoe && typeof this.shoe.startRound === 'function') {
            this.shoe.startRound();
        }
        this.dealerHand = new Hand();
        this.playerHands = [new Hand()];
        this.currentHandIndex = 0;

        // Deal cards in proper order: Player, Dealer, Player, Dealer (face-up)
        this.playerHands[0].addCard(this.shoe.deal());
        this.dealerHand.addCard(this.shoe.deal());
        this.playerHands[0].addCard(this.shoe.deal());
        this.dealerHand.addCard(this.shoe.deal());
    }

    placeBet(amount) {
        this.playerHands[0].bet = amount;
        this.playerHands[0].originalBet = amount;
        this.playerHands[0].doubled = false;
    }

    hit(handIndex = this.currentHandIndex) {
        const hand = this.playerHands[handIndex];
        const card = this.shoe.deal();
        hand.addCard(card);
        
        if (hand.isBusted()) {
            this.endHand(handIndex);
        }
        
        return card;
    }

    stand(handIndex = this.currentHandIndex) {
        this.playerHands[handIndex].hasStood = true;
        this.endHand(handIndex);
    }

    surrender(handIndex = this.currentHandIndex) {
        if (!this.allowSurrender) {
            throw new Error("Surrender is not allowed in current game settings");
        }
        
        if (this.playerHands[handIndex].cards.length > 2) {
            throw new Error("Can only surrender on initial hand");
        }

        this.playerHands[handIndex].hasSurrendered = true;
        this.endHand(handIndex);
    }

    double(handIndex = this.currentHandIndex) {
        const hand = this.playerHands[handIndex];
        if (hand.cards.length !== 2) {
            throw new Error("Can only double down on initial hand");
        }
        // ensure originalBet exists
        if (!hand.originalBet) {
            hand.originalBet = hand.bet || 0;
        }
        hand.doubled = true;
        hand.bet *= 2;
        this.hit(handIndex);
        if (!hand.isBusted()) {
            this.stand(handIndex);
        }
    }

    split(handIndex = this.currentHandIndex) {
        const hand = this.playerHands[handIndex];
        if (hand.cards.length !== 2 || hand.cards[0].getValue() !== hand.cards[1].getValue()) {
            throw new Error("Can only split identical value cards");
        }

        const newHand = new Hand();
        newHand.bet = hand.bet;
        newHand.originalBet = hand.originalBet || hand.bet;
        newHand.doubled = false;
        // mark both hands as split to prevent surrender/double where rules disallow
        newHand.isSplit = true;
        hand.isSplit = true;
        newHand.addCard(hand.cards.pop());
        newHand.addCard(this.shoe.deal());
        hand.addCard(this.shoe.deal());

        this.playerHands.splice(handIndex + 1, 0, newHand);
    }

    dealerPlay() {
        const card = this.shoe.deal();
        this.dealerHand.addCard(card);
        return card;
    }

    shouldDealerHit() {
        const score = this.dealerHand.getScore();
        console.log('Checking dealer score:', score);
        
        // Always hit on 16 or below
        if (score < 17) {
            console.log('Dealer hits: Score below 17');
            return true;
        }
        
        // Check for soft 17 if score is exactly 17
        if (score === 17) {
            let hardScore = 0;
            let aces = 0;
            
            // Count aces and calculate score without aces
            for (let card of this.dealerHand.cards) {
                if (card.rank === 'A') {
                    aces++;
                } else {
                    hardScore += card.getValue();
                }
            }
            
            // If we have an ace and the rest of the cards sum to 6 or less, it's a soft 17
            const isSoft17 = aces > 0 && hardScore <= 6;
            
            console.log('Score is 17 - Soft:', isSoft17, 'Stand on Soft 17:', this.standOnSoft17);
            
            // Hit on soft 17 if H17 rule is in effect
            return isSoft17 && !this.standOnSoft17;
        }
        
        // Stand on anything above 17
        console.log('Dealer stands: Score', score);
        return false;
    }

    endHand(handIndex) {
        // Move to next hand if available
        if (handIndex < this.playerHands.length - 1) {
            this.currentHandIndex = handIndex + 1;
        } else {
            // Let the UI handle dealer's play and settlement
            // UI will call `settleAllHands()` after dealer finishes drawing
        }
    }

    settleAllHands() {
        // Move all cards to discard pile. Payouts and UI reset are handled by the UI.
        this.shoe.addToDiscardPile([...this.dealerHand.cards]);
        for (let hand of this.playerHands) {
            this.shoe.addToDiscardPile([...hand.cards]);
        }
        // clear per-round tracking in the shoe
        if (this.shoe && typeof this.shoe.endRound === 'function') {
            this.shoe.endRound();
        }
        // Reset hands after discarding
        this.dealerHand = new Hand();
        this.playerHands = [new Hand()];
        this.currentHandIndex = 0;
    }
}
