# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e6]:
    - img "Symphony Logo" [ref=e7]
    - heading "Symphony" [level=1] [ref=e8]
  - generic [ref=e9]:
    - heading "Sign In" [level=2] [ref=e10]
    - generic [ref=e11]:
      - generic [ref=e12]:
        - generic [ref=e13]: Email
        - textbox "Email" [ref=e14]:
          - /placeholder: you@example.com
      - generic [ref=e15]:
        - generic [ref=e16]: Password
        - textbox "Password" [ref=e17]:
          - /placeholder: At least 6 characters
      - button "Sign In" [ref=e18] [cursor=pointer]
    - button "Forgot your password?" [ref=e20]
    - paragraph [ref=e22]:
      - text: Don't have an account?
      - button "Sign Up" [ref=e23]
```