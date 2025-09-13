class PackersTracker {
    constructor() {
        this.apiUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb/schedule';
        this.init();
    }

    async init() {
        try {
            await this.fetchPackersData();
        } catch (error) {
            this.showError('Failed to load Packers data');
            console.error('Error:', error);
        }
    }

    async fetchPackersData() {
        const response = await fetch(this.apiUrl);
        const data = await response.json();
        this.processScheduleData(data);
    }

    processScheduleData(data) {
        const events = data.events || [];
        
        console.log('Total events:', events.length);
        
        // Get completed games
        const completedGames = events.filter(event => {
            const status = event.competitions?.[0]?.status?.type?.name;
            return status === 'STATUS_FINAL';
        });

        console.log('Completed games:', completedGames.length);
        
        let wins = 0;
        let losses = 0;

        // Check each completed game
        completedGames.forEach(event => {
            console.log('Processing game:', event.name);
            const competition = event.competitions[0];
            const competitors = competition.competitors;
            
            let packersScore = 0;
            let opponentScore = 0;
            
            // Find Packers and opponent scores
            competitors.forEach(competitor => {
                console.log('Full competitor object:', competitor);
                console.log('Score object:', competitor.score);
               console.log('Team info:', competitor.team);
                if (competitor.team.abbreviation === 'GB') {
                    packersScore = parseInt(competitor.score.value) || 0;
                } else {
                    opponentScore = parseInt(competitor.score.value) || 0;
                }
            });
            
            console.log('Packers:', packersScore, 'Opponent:', opponentScore);
            
            // Count the result for this game
            if (packersScore > opponentScore) {
                wins++;
                console.log('Packers won this game');
            } else if (packersScore < opponentScore) {
                losses++;
                console.log('Packers lost this game');
            }
        });

        console.log('Final record - Wins:', wins, 'Losses:', losses);
        
        // Display result
        const isUndefeated = losses === 0 && wins > 0;
        this.displayResult(isUndefeated, wins, losses);
        
        // Show games
        this.showGames(events);
        
        // Show last updated
        this.showLastUpdated();
        
        // Setup share buttons
        this.setupShareButtons();
    }

    displayResult(isUndefeated, wins, losses) {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        if (isUndefeated) {
            answerEl.innerHTML = '🧀 🧀 🧀<br>YES!!!<br>🧀 🧀 🧀';
            answerEl.className = 'answer yes';
            document.body.classList.add('undefeated');
        } else {
            answerEl.textContent = 'NO 😢';
            answerEl.className = 'answer no';
            document.body.classList.remove('undefeated');
        }
        
        recordEl.textContent = `Current Record: ${wins}-${losses}`;
    }

    showGames(events) {
        const now = new Date();
        
        // Previous game
        const previousGames = events.filter(event => {
            const status = event.competitions?.[0]?.status?.type?.name;
            return status === 'STATUS_FINAL';
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        if (previousGames.length > 0) {
            this.displayPreviousGame(previousGames[0]);
        }

        // Next game
        const upcomingGames = events.filter(event => {
            const gameDate = new Date(event.date);
            const status = event.competitions?.[0]?.status?.type?.name;
            return gameDate > now && status === 'STATUS_SCHEDULED';
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        if (upcomingGames.length > 0) {
            this.displayNextGame(upcomingGames[0]);
        }
    }

    displayPreviousGame(game) {
        const el = document.getElementById('previous-game');
        const info = document.getElementById('previous-game-info');
        
        const competition = game.competitions[0];
        const competitors = competition.competitors;
        const date = new Date(game.date);
        
        let packersScore = 0;
        let opponentScore = 0;
        let opponent = '';
        let isHome = false;
        
        competitors.forEach(competitor => {
            if (competitor.team.abbreviation === 'GB') {
                packersScore = parseInt(competitor.score.value) || 0;
                isHome = competitor.homeAway === 'home';
            } else {
                opponentScore = parseInt(competitor.score.value) || 0;
                opponent = competitor.team.displayName;
            }
        });
        
        const won = packersScore > opponentScore;
        const result = won ? 'W' : 'L';
        const color = won ? '#4CAF50' : '#f44336';
        
        info.innerHTML = `
            <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${isHome ? 'vs' : '@'} ${opponent}
            </div>
            <div style="font-size: 1.3rem; color: ${color}; font-weight: bold; margin-bottom: 0.5rem;">
                ${result} ${packersScore}-${opponentScore}
            </div>
            <div style="font-size: 1rem; opacity: 0.9;">
                ${date.toLocaleDateString()}
            </div>
        `;
        
        el.style.display = 'block';
    }

    displayNextGame(game) {
        const el = document.getElementById('next-game');
        const info = document.getElementById('next-game-info');
        
        const competition = game.competitions[0];
        const competitors = competition.competitors;
        const date = new Date(game.date);
        const broadcast = competition.broadcasts?.[0];
        
        // Debug broadcast data
        console.log('Full competition object:', competition);
        console.log('Broadcasts array:', competition.broadcasts);
        console.log('First broadcast:', broadcast);
        
        const network = broadcast?.media?.shortName || 'TBD';
        
        let opponent = '';
        let isHome = false;
        
        competitors.forEach(competitor => {
            if (competitor.team.abbreviation === 'GB') {
                isHome = competitor.homeAway === 'home';
            } else {
                opponent = competitor.team.displayName;
            }
        });
        
        info.innerHTML = `
            <div style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${isHome ? 'vs' : '@'} ${opponent}
            </div>
            <div style="font-size: 1rem; opacity: 0.9;">
                ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}
            </div>
            <div style="font-size: 1rem; opacity: 0.9; margin-top: 0.5rem;">
                📺 ${network}
            </div>
        `;
        
        el.style.display = 'block';
    }

    showLastUpdated() {
        const el = document.getElementById('last-updated');
        const now = new Date();
        el.textContent = `Last updated: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;
    }
    
    setupShareButtons() {
        const twitterBtn = document.getElementById('share-twitter');
        const facebookBtn = document.getElementById('share-facebook');
        const copyBtn = document.getElementById('share-copy');
        const redditBtn = document.getElementById('share-reddit');
        const blueskyBtn = document.getElementById('share-bluesky');
        
        twitterBtn.addEventListener('click', () => this.shareToTwitter());
        facebookBtn.addEventListener('click', () => this.shareToFacebook());
        copyBtn.addEventListener('click', () => this.copyLink());
        redditBtn.addEventListener('click', () => this.shareToReddit());
        blueskyBtn.addEventListener('click', () => this.shareToBluesky());
    }
    
    getShareMessage() {
        const answerEl = document.getElementById('answer');
        const recordEl = document.getElementById('record');
        
        const isUndefeated = answerEl.textContent.includes('YES');
        const record = recordEl.textContent;
        
        if (isUndefeated) {
            return `🧀 The Green Bay Packers are UNDEFEATED! ${record} 🧀 #GoPackGo`;
        } else {
            return `The Green Bay Packers are ${record} this season. #GoPackGo`;
        }
    }
    
    shareToTwitter() {
        const message = this.getShareMessage();
        const url = window.location.href;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
    }
    
    shareToFacebook() {
        const url = window.location.href;
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        window.open(facebookUrl, '_blank', 'width=580,height=296');
    }
    
    shareToReddit() {
        const message = this.getShareMessage();
        const url = window.location.href;
        const title = 'Are The Green Bay Packers Undefeated?';
        const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&text=${encodeURIComponent(message)}`;
        window.open(redditUrl, '_blank', 'width=600,height=500');
    }
    
    shareToBluesky() {
        const message = this.getShareMessage();
        const url = window.location.href;
        const shareText = `${message}\n\nCheck it out: ${url}`;
        const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
        window.open(blueskyUrl, '_blank', 'width=600,height=500');
    }
    
    async copyLink() {
        const copyBtn = document.getElementById('share-copy');
        const message = this.getShareMessage();
        const url = window.location.href;
        const shareText = `${message}\n\nCheck it out: ${url}`;
        
        try {
            await navigator.clipboard.writeText(shareText);
            
            // Visual feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="share-icon">✅</span>Copied!';
            copyBtn.classList.add('copy-success');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copy-success');
            }, 2000);
            
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = shareText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            // Visual feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="share-icon">✅</span>Copied!';
            copyBtn.classList.add('copy-success');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('copy-success');
            }, 2000);
        }
    }

    showError(message) {
        const answerEl = document.getElementById('answer');
        answerEl.innerHTML = `<div style="color: #ff6b6b;">${message}</div>`;
        answerEl.className = 'answer error';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PackersTracker();
});