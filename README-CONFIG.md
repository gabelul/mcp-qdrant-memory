# Tiered Configuration System

This MCP server now implements an expert-recommended **tiered configuration system** with cross-platform support, similar to industry-standard tools like AWS CLI, kubectl, and npm.

## 🚀 Quick Setup

### Option 1: Interactive Setup (Recommended)
```bash
npm run setup-config
# or
npm run config
```

This interactive wizard will:
- Detect your platform (Windows/macOS/Linux)
- Find existing configuration
- Create user-level configuration automatically
- Guide you through all settings

### Option 2: Manual Setup
Create a configuration file in the appropriate location for your platform:

**Windows:**
```
%APPDATA%\claude-code-memory\settings.txt
```

**macOS:**
```
~/Library/Application Support/claude-code-memory/settings.txt
```

**Linux:**
```
~/.config/claude-code-memory/settings.txt
```

## 📚 Configuration Priority

The system loads configuration in this order (first found wins):

1. **Environment variables** (highest priority)
   - `OPENAI_API_KEY`, `QDRANT_URL`, etc.
   - Perfect for CI/CD and Docker deployments

2. **Project-level configuration**
   - `./settings.txt` or `./.env` in your project directory
   - Override user settings for specific projects

3. **User-level configuration** (NEW!)
   - Platform-specific directory (see above)
   - **Works across all projects automatically**

4. **Global fallback** (backward compatibility)
   - MCP server installation directory
   - Maintains compatibility with existing setups

## ✨ Benefits

### Before (Traditional)
- Copy `settings.txt` to every project
- Inconsistent configuration across projects
- Manual API key management per project
- Platform-specific path issues

### After (Tiered System)
- **Single user-level configuration**
- **Automatic cross-project usage**
- **Cross-platform compatibility**
- **Environment variable support**
- **Project-specific overrides**

## 🧪 Testing Your Configuration

### Enable Debug Mode
```bash
export DEBUG_CONFIG=true
node dist/config.js
```

This shows:
- Which configuration source is being used
- All search paths attempted
- Configuration validation results
- Platform-specific directory detection

### Example Debug Output
```
[CONFIG DEBUG Starting tiered configuration system...
[CONFIG DEBUG] Platform: darwin
[CONFIG DEBUG] User config directory: ~/Library/Application Support/claude-code-memory
✅ Loaded configuration from User-level configuration (cross-platform)
   📁 Path: ~/Library/Application Support/claude-code-memory/settings.txt
```

## 🔧 Configuration File Format

```env
# Essential settings
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=your-collection-name
QDRANT_API_KEY=optional_qdrant_api_key

# Embedding provider (choose one)
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-large
# OR
# EMBEDDING_PROVIDER=voyage
# VOYAGE_API_KEY=your_voyage_api_key
# EMBEDDING_MODEL=voyage-3-lite

# Chat processing
CHAT_MODEL=o3

# Optional settings
indexer_debug=false
indexer_verbose=true
```

## 🛠️ Advanced Usage

### Environment Variables (CI/CD)
```bash
export OPENAI_API_KEY="sk-your-key"
export QDRANT_URL="http://localhost:6333"
export QDRANT_COLLECTION_NAME="my-project"
```

### Project-Specific Override
Create `settings.txt` in your project directory to override user-level settings for that specific project.

### Multiple API Keys
Different projects can use different API keys by setting project-level configuration or environment variables.

## 🔒 Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** in production
3. **User-level config** for development
4. **Project-level config** for team settings (without sensitive data)

## 🆘 Troubleshooting

### Configuration Not Loading
```bash
# Check debug output
DEBUG_CONFIG=true node dist/config.js

# Verify file exists and is readable
ls -la ~/Library/Application Support/claude-code-memory/settings.txt  # macOA
ls -la ~/.config/claude-code-memory/settings.txt                       # Linux
dir "%APPDATA%\claude-code-memory\settings.txt"                        # Windows
```

### Invalid Configuration
The system validates:
- Required fields are present
- API key format looks correct
- URLs are valid
- Provides helpful error messages with fix suggestions

### Migration from Old System
1. Run `npm run setup-config`
2. The wizard will find your existing configuration
3. Automatically migrates to new user-level location
4. Preserves all your current settings

## 🌟 What's New

- **Cross-platform user directories** (XDG Base Directory spec)
- **Automatic directory creation**
- **Configuration validation with helpful errors**
- **Debug logging system**
- **Interactive setup wizard**
- **Backward compatibility** with existing setups
- **Environment variable precedence**
- **Project-specific overrides**

## 📈 Impact

This upgrade solves:
- ✅ API key configuration issues across projects
- ✅ Cross-platform compatibility problems
- ✅ Manual configuration copying
- ✅ Inconsistent project setups
- ✅ Docker and CI/CD integration challenges

Your Claude Code Memory system now works seamlessly across all projects with industry-standard configuration management!