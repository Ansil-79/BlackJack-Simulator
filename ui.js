class BlackjackUI {
    constructor(game) {
        this.game = game;
        this.dealerArea = document.querySelector('.dealer-area .cards');
        this.playerArea = document.querySelector('.player-area .cards');
        
        // Dealer rule text is set by index.html script based on menu selection

        // Set up curved text effect
        const curvedText = document.getElementById('curved-text');
        if (curvedText) {
            const text = curvedText.textContent;
            curvedText.textContent = '';
            const chars = text.split('');
            const arc = 120; // Angle of the arc in degrees
            const radius = 200; // Radius of the arc
            
            chars.forEach((char, i) => {
                const span = document.createElement('span');
                span.textContent = char;
                const rotateAngle = (i - (chars.length / 2)) * (arc / chars.length);
                const translateY = -Math.cos(rotateAngle * Math.PI / 180) * radius;
                span.style.setProperty('--letter-rotate', rotateAngle + 'deg');
                span.style.setProperty('--letter-translate', translateY + '%');
                curvedText.appendChild(span);
            });
        }
        this.resultOverlay = document.querySelector('.result-overlay');
        this.resultText = document.querySelector('.result-text');
        this.chipsDisplay = document.querySelector('#balance');
        this.selectedBet = 0;
        this.chipPile = document.querySelector('#chipPile');
        this.placeBetButton = document.querySelector('#placeBet');
        this.gameControls = document.querySelector('.game-controls');
        this.betControls = document.querySelector('.bet-controls');
        this.setupEventListeners();
        this.updateChipsDisplay();
        // bet input is placed in the top-left; its value persists until changed
        // Initialize UI to show only the Place Bet control at the bottom of the table
        this.showBetAtBottom();
        // Position chip pile (compute exact midpoint between player area and place bet)
        // Use rAF so layout is ready
        requestAnimationFrame(() => this.positionChipPile());
        // reposition on window resize
        window.addEventListener('resize', () => this.positionChipPile());
    }

    setupEventListeners() {
        document.querySelector('#hit').addEventListener('click', () => this.handleHit());
        document.querySelector('#stand').addEventListener('click', () => this.handleStand());
        document.querySelector('#surrender').addEventListener('click', () => this.handleSurrender());
        document.querySelector('#double').addEventListener('click', () => this.handleDouble());
        document.querySelector('#split').addEventListener('click', () => this.handleSplit());
        this.placeBetButton.addEventListener('click', () => this.handleBetPlacement());
        // chip selection (delegated)
        if (this.chipPile) {
            this.chipPile.addEventListener('click', (e) => this.handleChipClick(e));
        }
    }

    // Helper: returns a promise that resolves when the CSS transition ends on `el` or after timeout
    waitForTransition(el, timeout = 600) {
        return new Promise((resolve) => {
            if (!el) return resolve();
            let finished = false;
            const onEnd = (ev) => {
                // only consider opacity/transform transitions as the end
                if (ev.propertyName && (ev.propertyName === 'opacity' || ev.propertyName === 'transform')) {
                    if (!finished) {
                        finished = true;
                        el.removeEventListener('transitionend', onEnd);
                        resolve();
                    }
                }
            };
            el.addEventListener('transitionend', onEnd);
            // fallback
            setTimeout(() => { if (!finished) { finished = true; el.removeEventListener('transitionend', onEnd); resolve(); } }, timeout);
        });
    }

    handleHit() {
        try {
            const card = this.game.hit();
            this.renderCard(card, this.playerArea);
            
            const playerHand = this.game.playerHands[this.game.currentHandIndex];
            if (playerHand.isBusted()) {
                // Reveal dealer's hole card (if rendered)
                const dealerCardElement = this.dealerArea.children[0];
                const dealerFirstCard = this.game.dealerHand.cards[0];
                if (dealerCardElement && dealerFirstCard) {
                    this.revealDealerCard(dealerCardElement, dealerFirstCard);
                }

                // Wait for the dealt-card animation to finish before showing the bust message
                const ANIMATION_DELAY = 700; // ms, matches deal/flip animations
                setTimeout(() => {
                    this.handleGameEnd('busted', playerHand);
                }, ANIMATION_DELAY);

                return;
            }
            // update control visibility after a hit (double shouldn't be offered after a hit)
            this.computeAndUpdateControls();
        } catch (error) {
            console.error('Hit error:', error);
        }
    }

    handleStand() {
        try {
            this.game.stand();
            
            // Disable all controls during dealer's play
            this.updateControls(false, false, false, false);
            
            // First reveal dealer's hole card
            const dealerFirstCard = this.game.dealerHand.cards[0];
            const dealerCardElement = this.dealerArea.children[0];
            this.revealDealerCard(dealerCardElement, dealerFirstCard);
            
            // Wait a bit after revealing hole card before starting dealer's play
            setTimeout(() => this.executeDealerPlay(), 800);
        } catch (error) {
            console.error('Stand error:', error);
        }
    }

    executeDealerPlay() {
        const currentScore = this.game.dealerHand.getScore();
        console.log('Dealer current score:', currentScore);

        // Keep dealing if score is under 17 or it's a soft 17 and H17 rule is in effect
        if (this.game.shouldDealerHit()) {
            console.log('Dealer hitting...');
            const card = this.game.dealerPlay();
            this.renderCard(card, this.dealerArea, true);
            
            const newScore = this.game.dealerHand.getScore();
            console.log('After hit, dealer score:', newScore);
            
            // Schedule next dealer card after animation
            setTimeout(() => this.executeDealerPlay(), 800);
        } else {
            console.log('Dealer stands with:', this.game.dealerHand.getScore());
            // Short delay before showing final outcome
            setTimeout(() => this.determineGameOutcome(), 500);
        }
    }

    handleDouble() {
        try {
            const hand = this.game.playerHands[this.game.currentHandIndex];
            const currentBet = hand.originalBet || hand.bet;
            if (this.game.chips < currentBet) return; // not enough to double

            // Deduct additional bet and mark doubled via game.double
            this.game.chips -= currentBet;
            this.updateChipsDisplay();

            // Perform double in game logic (this will hit and stand)
            this.game.double();

            // Render the card that was added by double (render horizontally to indicate double)
            const newCard = hand.cards[hand.cards.length - 1];
            this.renderCard(newCard, this.playerArea, false, false, true);

            // After double, update controls (double will be hidden)
            this.computeAndUpdateControls();

            // Proceed with dealer play / stand UI
            this.handleStand();
        } catch (error) {
            console.error('Double error:', error);
        }
    }

    handleSplit() {
        try {
            const currentBet = this.game.playerHands[this.game.currentHandIndex].bet;
            if (this.game.chips >= currentBet) {
                this.game.split();
                this.game.chips -= currentBet; // Deduct bet for new hand
                this.updateChipsDisplay();
                
                // Clear and re-render all player hands
                this.playerArea.innerHTML = '';
                // Render cards for each hand sequentially so we can map DOM nodes to hands
                this.game.playerHands.forEach(hand => {
                    hand.cards.forEach(card => {
                        this.renderCard(card, this.playerArea);
                    });
                });

                // If a split created two hands, animate a small separation between the
                // two cards of each hand to visually indicate the split. We rely on
                // the render order: hand0.cards..., hand1.cards..., so we can pick
                // items by index.
                if (this.game.playerHands.length >= 2) {
                    const children = Array.from(this.playerArea.children);
                    // For each hand, determine its starting index by summing previous card counts
                    let idx = 0;
                    for (let h = 0; h < this.game.playerHands.length; h++) {
                        const hand = this.game.playerHands[h];
                        // If the hand has exactly 2 cards (typical split), animate them
                        if (hand.cards.length >= 2) {
                            const firstCardEl = children[idx];
                            const secondCardEl = children[idx + 1];
                            if (firstCardEl && secondCardEl) {
                                // ensure no lingering classes
                                firstCardEl.classList.remove('split-left', 'split-right');
                                secondCardEl.classList.remove('split-left', 'split-right');
                                // Force layout then add classes to trigger transition
                                requestAnimationFrame(() => {
                                    // small timeout to ensure CSS transition will animate
                                    setTimeout(() => {
                                        firstCardEl.classList.add('split-left');
                                        secondCardEl.classList.add('split-right');
                                    }, 8);
                                });
                            }
                        }
                        idx += hand.cards.length;
                    }
                }

                // controls may change after a split
                this.computeAndUpdateControls();
            }
        } catch (error) {
            console.error('Split error:', error);
        }
    }

    handleSurrender() {
        try {
            this.game.surrender();
            const hand = this.game.playerHands[this.game.currentHandIndex];
            this.handleGameEnd('surrender', hand);
        } catch (error) {
            console.error('Surrender error:', error);
        }
    }

    determineGameOutcome() {
        const playerHand = this.game.playerHands[this.game.currentHandIndex];
        const dealerScore = this.game.dealerHand.getScore();
        const playerScore = playerHand.getScore();

        console.log('Final Scores - Player:', playerScore, 'Dealer:', dealerScore);

        // First check for busts
        if (playerHand.isBusted()) {
            console.log('Player busted');
            // Use 'busted' result so UI shows the correct message and does not run dealer play
            this.handleGameEnd('busted', playerHand);
            return;
        }
        
        if (this.game.dealerHand.isBusted()) {
            console.log('Dealer busted');
            this.handleGameEnd('win', playerHand);
            return;
        }

        // Then check for blackjacks
        if (playerHand.isBlackjack() && !this.game.dealerHand.isBlackjack()) {
            console.log('Player blackjack');
            this.handleGameEnd('blackjack', playerHand);
            return;
        }
        
        if (this.game.dealerHand.isBlackjack() && !playerHand.isBlackjack()) {
            console.log('Dealer blackjack');
            this.handleGameEnd('lose', playerHand);
            return;
        }

        // Finally compare scores
        if (playerScore > dealerScore) {
            console.log('Player wins with higher score');
            this.handleGameEnd('win', playerHand);
        } else if (dealerScore > playerScore) {
            console.log('Dealer wins with higher score');
            this.handleGameEnd('lose', playerHand);
        } else {
            console.log('Push - equal scores');
            this.handleGameEnd('push', playerHand);
        }
    }

    handleGameEnd(result, hand) {
        // Calculate payouts and update chips. Bets were deducted when placed (and doubled when doubled).
        // Fallback to the bet input value if the hand doesn't have originalBet (user reused same bet without re-placing).
    const inputBet = this.selectedBet || 0;
        const base = hand.originalBet || hand.bet || inputBet || 0;
        const wasDoubled = !!hand.doubled;
        const betSize = wasDoubled ? base * 2 : base;
        let payout = 0;

        if (result === 'blackjack') {
            // Blackjack pays 3:2 (return of bet + 1.5x)
            payout = base * 2.5;
        } else if (result === 'win') {
            // return original bet + winnings equal to bet (net shown is original bet)
            payout = betSize * 2; // return bet + winnings
        } else if (result === 'push') {
            payout = betSize; // return original bet(s)
        } else if (result === 'surrender') {
            payout = base / 2; // return half original bet
        } else {
            payout = 0; // lose, nothing to return
        }

        this.game.chips += payout;
        this.updateChipsDisplay();
        this.showResult(result, hand);
        this.updateControls(false, false, false, false);
    }

    handleBetPlacement() {
        const betAmount = this.selectedBet || 0;
        if (betAmount > 0) {
            this.placeBetButton.disabled = true;
            // lock-in the bet in the game (chips already deducted when chip was clicked)
            this.game.placeBet(betAmount);

            // Hide chips/place-bet first (they have CSS transitions), then deal and render cards.
            // Use transitionend to reliably sequence the animation.
            // Add an "exiting" class to trigger pop/scale + fade, then add hidden so opacity/transform animates.
            if (this.betControls) this.betControls.classList.add('exiting');
            if (this.chipPile) this.chipPile.classList.add('exiting');

            // force a frame so the exiting class is applied before hidden is toggled
            requestAnimationFrame(() => {
                this.showActionControls();
            });

            // Wait for betControls transition (and chipPile) to finish, then deal with staggered animation
            Promise.all([this.waitForTransition(this.betControls), this.waitForTransition(this.chipPile)])
                .then(() => {
                    // remove exiting classes (cleanup)
                    if (this.betControls) this.betControls.classList.remove('exiting');
                    if (this.chipPile) this.chipPile.classList.remove('exiting');

                    try {
                        this.game.dealInitialCards();
                        // Staggered render for nicer dealing animation
                        this.renderInitialCardsStaggered();
                    } catch (e) {
                        console.error('Error dealing initial cards:', e);
                        // fallback to immediate render
                        this.renderInitialCards();
                    }
                });
            // The bet input is in the top-left and its value persists; no extra display update needed
            
                // After the chips/place-bet transition finishes we'll deal. Once dealt
                // we need to check for an immediate blackjack on the player's hand and
                // only then proceed to show controls. The dealing and control
                // computation is handled inside the Promise callback below.
                    // After dealing/rendering, check for immediate player blackjack
                    const playerHand = this.game.playerHands[0];
                    // If playerHand exists and has blackjack, reveal dealer and settle
                    if (playerHand && playerHand.isBlackjack()) {
                        // Reveal dealer's hole card (first dealer card element)
                        const dealerFirstCard = this.game.dealerHand.cards[0];
                        const dealerCardElement = this.dealerArea.children[0];
                        if (dealerCardElement && dealerFirstCard) {
                            this.revealDealerCard(dealerCardElement, dealerFirstCard);
                        }

                        // If dealer also blackjack, it's a push, else player blackjack
                        if (this.game.dealerHand.isBlackjack()) {
                            this.handleGameEnd('push', playerHand);
                        } else {
                            this.handleGameEnd('blackjack', playerHand);
                        }
                        return;
                    }
                    // Otherwise controls will be computed via the animationend hook
                    // installed by renderInitialCardsStaggered().
        }
    }

    renderInitialCardsStaggered() {
        // Clear the table first
        this.dealerArea.innerHTML = '';
        this.playerArea.innerHTML = '';

        // Prepare sequence based on dealing order: player1, dealer1(hidden), player2, dealer2
        const seq = [];
        const playerHand = this.game.playerHands[0];
        if (!playerHand || !this.game.dealerHand) return this.renderInitialCards();

        seq.push({ card: playerHand.cards[0], area: this.playerArea, isDealer: false, isHidden: false });
        seq.push({ card: this.game.dealerHand.cards[0], area: this.dealerArea, isDealer: true, isHidden: true });
        seq.push({ card: playerHand.cards[1], area: this.playerArea, isDealer: false, isHidden: false });
        seq.push({ card: this.game.dealerHand.cards[1], area: this.dealerArea, isDealer: true, isHidden: false });

        // stagger timings (ms)
        const delays = [0, 300, 600, 900];
        let dealt = 0;
        seq.forEach((item, idx) => {
            setTimeout(() => {
                const el = this.renderCard(item.card, item.area, item.isDealer, item.isHidden);
                dealt++;
                // After all cards are dealt, check for immediate blackjack
                if (dealt === seq.length) {
                    // Immediate blackjack check
                    const playerHand = this.game.playerHands[0];
                    if (playerHand && playerHand.isBlackjack()) {
                        // Reveal dealer's hole card (first dealer card element)
                        const dealerFirstCard = this.game.dealerHand.cards[0];
                        const dealerCardElement = this.dealerArea.children[0];
                        if (dealerCardElement && dealerFirstCard) {
                            this.revealDealerCard(dealerCardElement, dealerFirstCard);
                        }
                        // If dealer also blackjack, it's a push, else player blackjack
                        if (this.game.dealerHand.isBlackjack()) {
                            this.handleGameEnd('push', playerHand);
                        } else {
                            this.handleGameEnd('blackjack', playerHand);
                        }
                        return;
                    }
                    // Otherwise controls will be computed via the animationend hook
                    this.computeAndUpdateControls();
                }
            }, delays[idx]);
        });
    }

    renderInitialCards() {
        // Clear the table first
        this.dealerArea.innerHTML = '';
        this.playerArea.innerHTML = '';
        
        // Render dealer's cards (first one hidden)
        const hiddenCard = this.renderCard(this.game.dealerHand.cards[0], this.dealerArea, true, true);
        this.renderCard(this.game.dealerHand.cards[1], this.dealerArea, true, false);
        
        // Render player's cards
        this.game.playerHands[0].cards.forEach(card => {
            this.renderCard(card, this.playerArea, false, false);
        });
    }

    updateChipsDisplay() {
        this.chipsDisplay.textContent = this.game.chips;
    }

    // Compute which controls should be visible/enabled based on current hand/game state
    computeAndUpdateControls() {
        const hand = this.game.playerHands[this.game.currentHandIndex];
        if (!hand) {
            this.updateControls(false, false, false, false);
            return;
        }

        const canHit = !hand.hasStood && !hand.isBusted();
        const canStand = !hand.hasStood;

    // Double only allowed on initial 2-card hand, not after split, and if player has enough chips
    const canDouble = hand.cards.length === 2 && !hand.isSplit && this.game.chips >= (hand.originalBet || hand.bet || 0);

        // Split only allowed on initial 2-card hand with equal values and enough chips
        const canSplit = hand.cards.length === 2 && hand.cards[0] && hand.cards[1] && (hand.cards[0].getValue() === hand.cards[1].getValue()) && this.game.chips >= (hand.bet || 0);

    // Surrender allowed only on initial 2-card hand, not after split, and if game allows surrender
    const canSurrender = this.game.allowSurrender && hand.cards.length === 2 && !hand.isSplit;

        this.updateControls(canHit, canStand, canDouble, canSurrender, canSplit);
    }

    renderCard(card, area, isDealer = false, isHidden = false, isDoubled = false) {
        const cardElement = document.createElement('div');
        const doubledClass = isDoubled ? ' doubled' : '';
        cardElement.className = `card ${card.color} dealt${doubledClass}`;

        if (isHidden) {
            cardElement.classList.add('card-back');
            cardElement.innerHTML = `
                <div class="card-back-design"></div>
            `;
        } else {
            cardElement.textContent = `${card.rank}${card.suit}`;
        }

        if (isDealer && area.children.length === 0) {
            cardElement.style.transformOrigin = 'right bottom';
        }

        area.appendChild(cardElement);
        return cardElement;
    }

    revealDealerCard(cardElement, card) {
        // Use an upside-down (X-axis) flip for the dealer's hole-card reveal
        cardElement.classList.add('card-reveal-up');
        cardElement.classList.remove('card-back');
        cardElement.textContent = `${card.rank}${card.suit}`;
        cardElement.classList.add(card.color);
    }

    clearTable() {
        this.dealerArea.innerHTML = '';
        this.playerArea.innerHTML = '';
        this.hideResult();
        this.placeBetButton.disabled = false;
        document.querySelector('.table').classList.remove('showing-result');
        // After clearing the table, show the Place Bet at the bottom of the table and hide action controls
        this.showBetAtBottom();
    }

    showResult(result, hand) {
        document.querySelector('.table').classList.add('showing-result');
        this.resultOverlay.className = 'result-overlay';
        
        let message = '';
        // compute base bet with fallback to input if needed
    const inputBet = this.selectedBet || 0;
        const baseBet = hand.originalBet || hand.bet || inputBet || 0;

        if (result === 'blackjack') {
            const winAmount = Math.round(baseBet * 1.5);
            message = `BLACKJACK! +$${winAmount}`;
            this.resultOverlay.classList.add('win', 'show');
        } else if (result === 'win') {
            if (hand.doubled) {
                // Show numeric amount equal to 2 * original bet
                const amount = baseBet * 2;
                message = `YOU WIN! +$${amount}`;
            } else {
                const amount = baseBet;
                message = `YOU WIN! +$${amount}`;
            }
            this.resultOverlay.classList.add('win', 'show');
        } else if (result === 'busted') {
            message = `BUSTED`;
            this.resultOverlay.classList.add('loss', 'show');
        } else if (result === 'lose') {
            message = `YOU LOSE`;
            this.resultOverlay.classList.add('loss', 'show');
        } else if (result === 'surrender') {
            // Show negative half of the resolved base bet (use originalBet if present)
            const baseBet = hand.originalBet || hand.bet || (this.selectedBet || 0);
            const half = Math.floor(baseBet / 2);
            message = `SURRENDER (-$${half})`;
            this.resultOverlay.classList.add('loss', 'show');
        } else if (result === 'push') {
            message = 'PUSH';
            this.resultOverlay.classList.add('push', 'show');
        }
        
        this.resultText.textContent = message;
        
        setTimeout(() => {
            this.hideResult();
            setTimeout(() => {
                this.clearTable();
                // After UI cleared, move cards to discard pile in the game
                try {
                    this.game.settleAllHands();
                } catch (e) {
                    console.warn('Error settling hands:', e);
                }
            }, 500);
        }, 2000);
    }

    hideResult() {
        this.resultOverlay.classList.remove('show');
        document.querySelector('.table').classList.remove('showing-result');
    }

    // UI helpers to toggle between centered Place Bet (initial / post-round)
    // and the action controls during a hand.
    showPlaceBetCentered() {
        if (this.betControls) {
            this.betControls.classList.remove('hidden');
            this.betControls.classList.add('place-centered');
        }
        if (this.gameControls) {
            this.gameControls.classList.add('hidden');
        }
        // ensure buttons are disabled until a bet is placed
        this.updateControls(false, false, false, false);
    }

    showActionControls() {
        if (this.betControls) {
            this.betControls.classList.add('hidden');
            this.betControls.classList.remove('place-centered');
        }
        if (this.chipPile) {
            this.chipPile.classList.add('hidden');
        }
        if (this.gameControls) {
            this.gameControls.classList.remove('hidden');
            // ensure primary action buttons are clickable immediately when shown
            // double/split availability will be updated shortly after cards are dealt
            this.updateControls(true, true, false, false);
        }
    }

    showBetAtBottom() {
        if (this.betControls) {
            this.betControls.classList.remove('hidden');
            this.betControls.classList.remove('place-centered');
            // ensure it's visually at the bottom-center of the table via CSS
            this.betControls.style.transform = 'translateX(-50%)';
        }
        if (this.chipPile) {
            this.chipPile.classList.remove('hidden');
            // clear any previous selection visuals
            const prev = this.chipPile.querySelector('.chip.selected');
            if (prev) prev.classList.remove('selected');
            this.selectedBet = 0;
            // compute and apply proper vertical position
            this.positionChipPile();
        }
        if (this.gameControls) {
            this.gameControls.classList.add('hidden');
        }
        // ensure action buttons are disabled until a bet is placed
        this.updateControls(false, false, false, false);
    }

    handleChipClick(e) {
        const btn = e.target.closest('.chip');
        if (!btn || !this.chipPile) return;
        const value = parseInt(btn.getAttribute('data-value')) || 0;

        // If clicking the already selected chip -> deselect and refund
        if (this.selectedBet === value) {
            btn.classList.remove('selected');
            this.game.chips += value;
            this.selectedBet = 0;
            this.updateChipsDisplay();
            return;
        }

        // If another chip was previously selected, refund it first
        if (this.selectedBet && this.selectedBet > 0) {
            const prev = this.chipPile.querySelector('.chip.selected');
            if (prev) prev.classList.remove('selected');
            this.game.chips += this.selectedBet;
            this.selectedBet = 0;
        }

        // Try to select the new chip (deduct immediately)
        if (this.game.chips >= value) {
            this.game.chips -= value;
            this.selectedBet = value;
            btn.classList.add('selected');
            this.updateChipsDisplay();
        } else {
            // brief flash to indicate insufficient funds
            btn.classList.add('insufficient');
            setTimeout(() => btn.classList.remove('insufficient'), 350);
        }
    }

    positionChipPile() {
        if (!this.chipPile) return;
        const table = document.querySelector('.table');
        const playerAreaEl = document.querySelector('.player-area');
        const betControlsEl = this.betControls;
        if (!table || !playerAreaEl || !betControlsEl) return;

        const tableRect = table.getBoundingClientRect();
        const playerRect = playerAreaEl.getBoundingClientRect();
        const betRect = betControlsEl.getBoundingClientRect();

        // compute mid y coord between bottom of player area and top of bet controls
        const playerBottom = playerRect.bottom - tableRect.top;
        const betTop = betRect.top - tableRect.top;
        let mid = Math.round((playerBottom + betTop) / 2);

        // adjust for chip pile height so it's centered vertically
        const chipHeight = this.chipPile.offsetHeight || 64;
        const topPos = mid - Math.round(chipHeight / 2);

        // enforce small gaps so chips do not overlap player cards or the place-bet control
        const minGapFromPlayer = 12; // px gap below player area
        const minGapFromBet = 85; // px gap above bet controls

        const minTop = playerBottom + minGapFromPlayer;
        const maxTop = betTop - minGapFromBet - chipHeight;

        // If space exists, clamp to the range; otherwise choose the best-effort position
        let finalTop;
        if (minTop <= maxTop) {
            finalTop = Math.max(minTop, Math.min(topPos, maxTop));
        } else {
            // not enough room to satisfy both gaps; prefer placing above the bet control
            finalTop = Math.max(8, Math.min(topPos, table.clientHeight - chipHeight - 8));
            // if this still would overlap the bet control, nudge it above the bet control
            if (finalTop + chipHeight > betTop - minGapFromBet) {
                finalTop = Math.max(8, betTop - minGapFromBet - chipHeight);
            }
        }

        // clamp to table bounds as a final safeguard
        finalTop = Math.max(8, Math.min(finalTop, table.clientHeight - chipHeight - 8));

        this.chipPile.style.top = finalTop + 'px';
    }

    updateControls(canHit, canStand, canDouble, canSurrender, canSplit = false) {
        const hitBtn = document.querySelector('#hit');
        const standBtn = document.querySelector('#stand');
        const doubleBtn = document.querySelector('#double');
        const surrenderBtn = document.querySelector('#surrender');
        const splitBtn = document.querySelector('#split');

        if (hitBtn) {
            hitBtn.disabled = !canHit;
            hitBtn.style.display = canHit ? '' : 'none';
        }
        if (standBtn) {
            standBtn.disabled = !canStand;
            standBtn.style.display = canStand ? '' : 'none';
        }

        if (doubleBtn) {
            // show double only when allowed
            doubleBtn.style.display = canDouble ? '' : 'none';
            doubleBtn.disabled = !canDouble;
        }

        if (splitBtn) {
            splitBtn.style.display = canSplit ? '' : 'none';
            splitBtn.disabled = !canSplit;
        }

        if (surrenderBtn) {
            surrenderBtn.style.display = canSurrender ? '' : 'none';
            surrenderBtn.disabled = !canSurrender;
        }
    }
}
